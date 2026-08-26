"""db.py — Conexión async a MongoDB.

En desarrollo local, si MONGO_URL no está configurada, los stores pueden usar
su respaldo en memoria. En producción, si MONGO_URL sí está configurada y la
conexión falla, usuarios/perfiles deben fallar de forma explícita: tratar una
caída de Mongo como "perfil vacío" puede destruir progreso válido.
"""

import os

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "chess_study")

_db = None
_warned = False


class PersistentStorageUnavailable(RuntimeError):
    """Mongo está configurado como persistencia real pero no está accesible."""


def persistent_storage_required() -> bool:
    # Se consulta el entorno en cada llamada para que tests/entornos que lo
    # monkeypatchean no dependan del orden de imports.
    return bool(os.environ.get("MONGO_URL"))


async def get_db():
    global _db, _warned
    if _db is not None:
        return _db

    # Sin una URL configurada el backend trabaja deliberadamente con los
    # respaldos en memoria de cada store. No debemos intentar conectar al
    # "localhost" de ejemplo: además de no aportar persistencia, una tarea
    # auxiliar (por ejemplo la telemetría agregada) podría retener una
    # respuesta mientras vence ese timeout.
    if not persistent_storage_required():
        return None

    try:
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
        await client.admin.command("ping")
        _db = client[MONGO_DB_NAME]
        # No imprimir MONGO_URL: en servicios gestionados suele contener
        # usuario/contraseña y terminaría expuesta en los logs de Render.
        print(f"Conectado a MongoDB (base: {MONGO_DB_NAME})")
        return _db
    except Exception as exc:
        if not _warned:
            print(
                f"No se pudo conectar a MongoDB ({type(exc).__name__}). "
                "Se reintentará en la próxima operación."
            )
            _warned = True
        _db = None
        return None
