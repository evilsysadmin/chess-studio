#!/usr/bin/env python3
"""Fail CI if a FastAPI route is accidentally left without auth.

Static by design: it runs without importing FastAPI/Mongo. Unlike the original
version, this scans every production backend module and nested APIRouter route,
so moving an endpoint out of main.py cannot make it invisible to the gate.
"""
from __future__ import annotations

import ast
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend-python"
MAIN = BACKEND / "main.py"
PUBLIC = {
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/forgot-password"),
    ("POST", "/api/auth/reset-password"),
    ("GET", "/api/health"),
    ("GET", "/api/ready"),
}
AUTH_DEPS = {"get_current_user", "get_user_or_m2m", "require_admin", "auth_dependency", "compute_auth_dependency", "admin_dependency"}
ADMIN_DEPS = {"require_admin", "admin_dependency"}
RATE_LIMITED_PUBLIC = PUBLIC - {("GET", "/api/health"), ("GET", "/api/ready")}
RATE_LIMITED_PRIVATE = {
    ("PUT", "/api/auth/email"),
    ("POST", "/api/auth/activity"),
    ("GET", "/api/profile"),
    ("PUT", "/api/profile"),
    ("PATCH", "/api/profile"),
    ("POST", "/api/analyze"),
    ("POST", "/api/analyze-move"),
}
METHODS = {"get", "post", "put", "delete", "patch"}


def name_of(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def route_from_decorator(dec):
    if not isinstance(dec, ast.Call) or not isinstance(dec.func, ast.Attribute):
        return None
    method = dec.func.attr.lower()
    if method not in METHODS or not dec.args or not isinstance(dec.args[0], ast.Constant):
        return None
    path = dec.args[0].value
    if not isinstance(path, str) or not (path.startswith("/api/") or path == "/"):
        return None
    return method.upper(), path


def dependencies(fn):
    deps = set()
    defaults = list(fn.args.defaults) + [d for d in fn.args.kw_defaults if d is not None]
    for default in defaults:
        if isinstance(default, ast.Call) and name_of(default.func) == "Depends" and default.args:
            dep = name_of(default.args[0])
            if dep:
                deps.add(dep)
    return deps


def has_rate_limit(fn):
    for dec in fn.decorator_list:
        if not isinstance(dec, ast.Call) or not isinstance(dec.func, ast.Attribute):
            continue
        if dec.func.attr != "limit":
            continue
        if isinstance(dec.func.value, ast.Name) and dec.func.value.id == "limiter":
            return True
    return False


def request_argument_names(fn):
    # slowapi resolves the incoming request by the literal parameter name, not
    # merely by a FastAPI Request annotation. A renamed `_request` therefore
    # breaks application import during route decoration/pytest collection.
    args = [*fn.args.posonlyargs, *fn.args.args, *fn.args.kwonlyargs]
    return {arg.arg for arg in args}


def production_sources():
    for path in sorted(BACKEND.glob("*.py")):
        if path.name.startswith("test_") or path.name == "conftest.py":
            continue
        yield path


def narrative_router_wiring_ok(main_tree):
    for node in ast.walk(main_tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr != "include_router" or not node.args:
            continue
        factory = node.args[0]
        if not isinstance(factory, ast.Call) or name_of(factory.func) != "build_narrative_router":
            continue
        kwargs = {kw.arg: name_of(kw.value) for kw in factory.keywords if kw.arg}
        return kwargs.get("auth_dependency") == "get_current_user" and kwargs.get("admin_dependency") == "require_admin"
    return False


def game_router_wiring_ok(main_tree):
    for node in ast.walk(main_tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr != "include_router" or not node.args:
            continue
        factory = node.args[0]
        if not isinstance(factory, ast.Call) or name_of(factory.func) != "build_game_router":
            continue
        kwargs = {kw.arg: name_of(kw.value) for kw in factory.keywords if kw.arg}
        return (
            kwargs.get("auth_dependency") == "get_current_user"
            and kwargs.get("compute_auth_dependency") == "get_user_or_m2m"
            and kwargs.get("limiter") == "limiter"
        )
    return False


def cors_allowed_methods(main_tree):
    """Return the explicit CORSMiddleware allow_methods set from main.py.

    Keeping this in the static gate catches a nasty class of browser-only
    failures: FastAPI can expose a perfectly valid PATCH/DELETE route while
    the browser never reaches it because the CORS preflight rejects the method.
    """
    if main_tree is None:
        return None
    for node in ast.walk(main_tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr != "add_middleware" or not node.args:
            continue
        if name_of(node.args[0]) != "CORSMiddleware":
            continue
        for kw in node.keywords:
            if kw.arg != "allow_methods":
                continue
            if not isinstance(kw.value, (ast.List, ast.Tuple, ast.Set)):
                return None
            methods = set()
            for item in kw.value.elts:
                if not isinstance(item, ast.Constant) or not isinstance(item.value, str):
                    return None
                methods.add(item.value.upper())
            return methods
    return None


def cors_allowed_headers(main_tree):
    """Return explicit CORSMiddleware allow_headers from main.py.

    Browser-only failures are especially nasty here: adding a custom request
    header in the frontend silently creates a preflight requirement. Keep the
    critical headers in the static API contract so Idempotency-Key (and future
    auth/correlation headers) cannot drift away from CORS again.
    """
    if main_tree is None:
        return None
    for node in ast.walk(main_tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr != "add_middleware" or not node.args:
            continue
        if name_of(node.args[0]) != "CORSMiddleware":
            continue
        for kw in node.keywords:
            if kw.arg != "allow_headers":
                continue
            if not isinstance(kw.value, (ast.List, ast.Tuple, ast.Set)):
                return None
            headers = set()
            for item in kw.value.elts:
                if not isinstance(item, ast.Constant) or not isinstance(item.value, str):
                    return None
                headers.add(item.value.lower())
            return headers
    return None


failures = []
seen = set()
route_count = 0
source_counts = {}
main_tree = None

for source in production_sources():
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    if source == MAIN:
        main_tree = tree
    count = 0
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        routes = [r for d in node.decorator_list if (r := route_from_decorator(d))]
        if not routes:
            continue
        deps = dependencies(node)
        rate_limited = has_rate_limit(node)
        if rate_limited and not ({"request", "websocket"} & request_argument_names(node)):
            route_labels = ", ".join(f"{method} {path}" for method, path in routes)
            failures.append(
                f"{route_labels}: @limiter.limit exige argumento literal request/websocket "
                f"({source.name}:{node.name})"
            )
        for method, path in routes:
            count += 1
            route_count += 1
            key = (method, path)
            if key in seen:
                failures.append(f"{method} {path}: ruta duplicada detectada ({source.name}:{node.name})")
            seen.add(key)
            if key in PUBLIC:
                if key in RATE_LIMITED_PUBLIC and not rate_limited:
                    failures.append(f"{method} {path}: endpoint público sensible sin @limiter.limit ({source.name}:{node.name})")
                continue
            if key in RATE_LIMITED_PRIVATE and not rate_limited:
                failures.append(f"{method} {path}: endpoint privado sensible sin @limiter.limit ({source.name}:{node.name})")
            if not (deps & AUTH_DEPS):
                failures.append(f"{method} {path}: sin dependencia de autenticación ({source.name}:{node.name})")
            if path.startswith("/api/admin") and not (deps & ADMIN_DEPS):
                failures.append(f"{method} {path}: admin sin dependencia admin ({source.name}:{node.name})")
    if count:
        source_counts[source.name] = count

missing = PUBLIC - seen
if missing:
    failures.extend(f"allowlist pública apunta a ruta inexistente: {m} {p}" for m, p in sorted(missing))

# narrative_api usa dependencias inyectadas por factory; el gate verifica
# también la unión en main.py, no sólo que el parámetro se llame bonito.
if ("POST", "/api/narrative") in seen or ("GET", "/api/admin/ai-metrics") in seen:
    if main_tree is None or not narrative_router_wiring_ok(main_tree):
        failures.append("build_narrative_router debe inyectar get_current_user + require_admin en main.py")

if any(path.startswith("/api/games") or path in {"/api/analyze", "/api/analyze-move"} for _method, path in seen):
    if main_tree is None or not game_router_wiring_ok(main_tree):
        failures.append("build_game_router debe inyectar get_current_user + get_user_or_m2m + limiter en main.py")

main_source = MAIN.read_text(encoding="utf-8") if MAIN.exists() else ""
if "Limiter(key_func=rate_limit_key" not in main_source:
    failures.append("Limiter principal debe usar rate_limit_key, no una IP compartida para usuarios autenticados")
if 'return f"user:{username}"' not in main_source or 'return f"ip:{get_remote_address(request)}"' not in main_source:
    failures.append("rate_limit_key debe separar buckets por cuenta autenticada y usar IP sólo para tráfico anónimo")

cors_methods = cors_allowed_methods(main_tree)
required_cors_methods = {method for method, _path in seen} | {"OPTIONS"}
if cors_methods is None:
    failures.append("CORSMiddleware debe declarar allow_methods explícitamente en main.py")
else:
    missing_cors_methods = required_cors_methods - cors_methods
    if missing_cors_methods:
        failures.append(
            "CORSMiddleware no permite métodos expuestos por la API: "
            + ", ".join(sorted(missing_cors_methods))
        )

cors_headers = cors_allowed_headers(main_tree)
required_cors_headers = {
    "authorization",
    "content-type",
    "idempotency-key",
    "x-api-key",
    "x-request-id",
    "x-client-release",
}
if cors_headers is None:
    failures.append("CORSMiddleware debe declarar allow_headers explícitamente en main.py")
else:
    missing_cors_headers = required_cors_headers - cors_headers
    if missing_cors_headers:
        failures.append(
            "CORSMiddleware no permite cabeceras requeridas por clientes: "
            + ", ".join(sorted(missing_cors_headers))
        )

print("== Chess Studio · API surface gate ==")
print("Rutas públicas deliberadas:")
for method, path in sorted(PUBLIC):
    print(f"  {method:6} {path}")
print(f"Rutas auditadas: {route_count} en {len(source_counts)} módulo(s) ({', '.join(f'{k}:{v}' for k, v in source_counts.items())})")

if failures:
    print("\nFALLO: superficie API insegura:")
    for item in failures:
        print(f"  - {item}")
    sys.exit(1)
print("\nOK: rutas privadas con auth, endpoints sensibles rate-limited por identidad, admin protegido, routers incluidos y CORS completo.")
