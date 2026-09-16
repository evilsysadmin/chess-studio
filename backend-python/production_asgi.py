"""Production ASGI entrypoint with cheap hostile-path rejection."""
from hostile_path_guard import HostilePathGuard
from main import app as fastapi_app

app = HostilePathGuard(fastapi_app)
