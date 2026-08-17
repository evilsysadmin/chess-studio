"""db.py — Conexión a MongoDB (async, vía motor). Si no está disponible (por
ejemplo corriendo `uvicorn main:app` a pelo, sin Docker Compose), quien la
usa (game_store.py) cae automáticamente a un diccionario en memoria — así el
desarrollo local sigue funcionando sin depender de tener Mongo instalado a
mano.
"""

import os

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "chess_study")

_db = None
_warned = False


async def get_db():
    global _db, _warned
    if _db is not None:
        return _db

    try:
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
        await client.admin.command("ping")
        _db = client[MONGO_DB_NAME]
        print(f"Conectado a MongoDB en {MONGO_URL} (base: {MONGO_DB_NAME})")
        return _db
    except Exception as e:
        if not _warned:
            print(
                f"No se pudo conectar a MongoDB ({e}). "
                "Usando almacenamiento en memoria como respaldo — "
                "las partidas no sobrevivirán a un reinicio."
            )
            _warned = True
        _db = None  # deja la puerta abierta para reintentar en la próxima llamada
        return None
