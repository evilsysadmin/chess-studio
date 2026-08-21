#!/usr/bin/env python3
"""Fail CI if a new FastAPI route is accidentally left without auth.

This is deliberately static: it runs in the security job without importing the
application or needing Mongo/FastAPI dependencies installed. Public routes are
an explicit allowlist; every other route must declare Depends(get_current_user),
Depends(get_user_or_m2m) or Depends(require_admin).
"""
from __future__ import annotations
import ast
from pathlib import Path
import sys

SOURCE = Path(__file__).resolve().parents[1] / "backend-python" / "main.py"
PUBLIC = {
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/forgot-password"),
    ("POST", "/api/auth/reset-password"),
    ("GET", "/api/health"),
}
AUTH_DEPS = {"get_current_user", "get_user_or_m2m", "require_admin"}
ADMIN_DEP = "require_admin"
RATE_LIMITED_PUBLIC = PUBLIC - {("GET", "/api/health")}
METHODS = {"get", "post", "put", "delete", "patch"}

def name_of(node):
    if isinstance(node, ast.Name): return node.id
    if isinstance(node, ast.Attribute): return node.attr
    return None

def route_from_decorator(dec):
    if not isinstance(dec, ast.Call) or not isinstance(dec.func, ast.Attribute): return None
    if not isinstance(dec.func.value, ast.Name) or dec.func.value.id != "app": return None
    method = dec.func.attr.lower()
    if method not in METHODS or not dec.args or not isinstance(dec.args[0], ast.Constant): return None
    return method.upper(), str(dec.args[0].value)

def dependencies(fn):
    deps=set()
    defaults=list(fn.args.defaults)+[d for d in fn.args.kw_defaults if d is not None]
    for default in defaults:
        if isinstance(default, ast.Call) and name_of(default.func)=="Depends" and default.args:
            dep=name_of(default.args[0])
            if dep: deps.add(dep)
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

tree=ast.parse(SOURCE.read_text(encoding="utf-8"), filename=str(SOURCE))
failures=[]
seen=set()
for node in tree.body:
    if not isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)): continue
    routes=[r for d in node.decorator_list if (r:=route_from_decorator(d))]
    if not routes: continue
    deps=dependencies(node)
    for method,path in routes:
        seen.add((method,path))
        if (method,path) in PUBLIC:
            if (method, path) in RATE_LIMITED_PUBLIC and not has_rate_limit(node):
                failures.append(f"{method} {path}: endpoint público sensible sin @limiter.limit ({node.name})")
            continue
        if not (deps & AUTH_DEPS):
            failures.append(f"{method} {path}: sin dependencia de autenticación ({node.name})")
        if path.startswith('/api/admin') and ADMIN_DEP not in deps:
            failures.append(f"{method} {path}: admin sin Depends(require_admin) ({node.name})")

missing=PUBLIC-seen
if missing:
    failures.extend(f"allowlist pública apunta a ruta inexistente: {m} {p}" for m,p in sorted(missing))

print("== Chess Studio · API surface gate ==")
print("Rutas públicas deliberadas:")
for method,path in sorted(PUBLIC): print(f"  {method:6} {path}")
if failures:
    print("\nFALLO: superficie API insegura:")
    for item in failures: print(f"  - {item}")
    sys.exit(1)
print("\nOK: rutas privadas con auth, admin con require_admin y auth pública con rate-limit.")
