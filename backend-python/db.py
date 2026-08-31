"""db.py — Conexión async a MongoDB.

En desarrollo local, si MONGO_URL no está configurada, los stores pueden usar
su respaldo en memoria. En producción, si MONGO_URL sí está configurada y la
conexión falla, usuarios/perfiles deben fallar de forma explícita: tratar una
caída de Mongo como "perfil vacío" puede destruir progreso válido.

La conexión se abre en single-flight: si Mongo cae, una ráfaga de requests no
debe lanzar una ráfaga equivalente de pings de 3 segundos. Tras un fallo se
aplica un cooldown corto y las operaciones siguientes fallan rápido hasta que
toque reintentar.
"""

import asyncio
import os
import time

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "chess_study")
MONGO_RETRY_COOLDOWN_S = max(0.25, float(os.environ.get("MONGO_RETRY_COOLDOWN_S", "5")))

_db = None
_client = None
_warned = False
_connect_lock: asyncio.Lock | None = None
_connect_lock_loop: asyncio.AbstractEventLoop | None = None
_retry_after_monotonic = 0.0
_monotonic = time.monotonic


class PersistentStorageUnavailable(RuntimeError):
    """Mongo está configurado como persistencia real pero no está accesible."""


def validate_mongo_environment(env: dict[str, str] | None = None) -> str:
    """Valida que un entorno desplegado seleccione su base explícitamente.

    ``MONGO_URL`` identifica y autentica contra el cluster. ``MONGO_DB_NAME``
    selecciona el namespace de datos. Desarrollo conserva defaults cómodos,
    pero staging/producción no pueden depender de ellos ni compartir base.
    """
    values = os.environ if env is None else env
    environment = str(values.get("ENVIRONMENT") or "development").strip().lower()
    mongo_url = str(values.get("MONGO_URL") or "").strip()
    database = str(values.get("MONGO_DB_NAME") or "").strip()
    deployed = environment in {"production", "prod", "staging", "stage"}
    if deployed and not mongo_url:
        raise RuntimeError(f"{environment}: MONGO_URL es obligatorio")
    if deployed and not database:
        raise RuntimeError(f"{environment}: MONGO_DB_NAME debe configurarse explícitamente")
    if environment in {"staging", "stage"} and database == "chess_study":
        raise RuntimeError("staging no puede usar la base de producción chess_study")
    if environment in {"production", "prod"} and database != "chess_study":
        raise RuntimeError("producción debe usar MONGO_DB_NAME=chess_study")
    return database or "chess_study"


def persistent_storage_required() -> bool:
    # Se consulta el entorno en cada llamada para que tests/entornos que lo
    # monkeypatchean no dependan del orden de imports.
    return bool(os.environ.get("MONGO_URL"))


def _get_connect_lock() -> asyncio.Lock:
    """Devuelve un lock ligado al event loop activo.

    Producción usa un único loop por worker, pero algunos tests crean varios
    loops secuenciales en el mismo intérprete. No conservamos un lock ligado a
    un loop ya cerrado.
    """
    global _connect_lock, _connect_lock_loop
    loop = asyncio.get_running_loop()
    if _connect_lock is None or _connect_lock_loop is not loop:
        _connect_lock = asyncio.Lock()
        _connect_lock_loop = loop
    return _connect_lock


def _retry_is_cooling_down(now: float | None = None) -> bool:
    value = _monotonic() if now is None else float(now)
    return value < _retry_after_monotonic


async def get_db():
    global _db, _client, _warned, _retry_after_monotonic
    if _db is not None:
        return _db
    if _retry_is_cooling_down():
        return None

    # Sólo un request por worker intenta conectar. Los demás esperan ese único
    # intento y reutilizan el resultado o el cooldown que deje el fallo.
    async with _get_connect_lock():
        if _db is not None:
            return _db
        if _retry_is_cooling_down():
            return None

        client = None
        try:
            client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
            await client.admin.command("ping")
            _client = client
            _db = client[MONGO_DB_NAME]
            _retry_after_monotonic = 0.0
            _warned = False
            # No imprimir MONGO_URL: en servicios gestionados suele contener
            # usuario/contraseña y terminaría expuesta en los logs de Render.
            print(f"Conectado a MongoDB (base: {MONGO_DB_NAME})")
            return _db
        except Exception as exc:
            if client is not None:
                try:
                    client.close()
                except Exception:
                    pass
            if not _warned:
                print(
                    f"No se pudo conectar a MongoDB ({type(exc).__name__}). "
                    f"Se reintentará tras {MONGO_RETRY_COOLDOWN_S:g} s."
                )
                _warned = True
            _client = None
            _db = None
            _retry_after_monotonic = _monotonic() + MONGO_RETRY_COOLDOWN_S
            return None
