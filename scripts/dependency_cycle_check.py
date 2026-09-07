#!/usr/bin/env python3
"""Detecta ciclos de imports internos sin instalar dependencias.

Frontend: JS/JSX/MJS productivo bajo frontend/src, excluyendo tests y main.jsx
(la entrada no puede ser dependencia de ningún módulo y no añade señal al grafo).
Backend: módulos Python productivos de primer nivel bajo backend-python.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend" / "src"
BACKEND = ROOT / "backend-python"
JS_EXTS = (".js", ".jsx", ".mjs")
IMPORT_RE = re.compile(r"(?:(?:import|export)\s+(?:[^'\"]*?\s+from\s+)?|import\s*\()\s*['\"]([^'\"]+)['\"]")


def resolve_js(source: Path, spec: str) -> Path | None:
    if not spec.startswith("."):
        return None
    # Vite permits resource queries such as ?raw and ?url. They change how the
    # resolved file is loaded, not which repository path the import points at.
    path_spec = re.split(r"[?#]", spec, maxsplit=1)[0]
    base = source.parent / path_spec
    candidates = [base, *(Path(str(base) + ext) for ext in JS_EXTS), *(base / f"index{ext}" for ext in JS_EXTS)]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise RuntimeError(f"import relativo no resoluble: {source.relative_to(ROOT)} -> {spec}")


def frontend_graph():
    files = sorted(
        p.resolve()
        for p in FRONTEND.rglob("*")
        if p.is_file() and p.suffix in JS_EXTS and ".test." not in p.name and p.name != "main.jsx"
    )
    nodes = set(files)
    graph = {p: set() for p in files}
    for source in files:
        for spec in IMPORT_RE.findall(source.read_text(encoding="utf-8")):
            target = resolve_js(source, spec)
            if target in nodes:
                graph[source].add(target)
    return graph


def backend_graph():
    files = sorted(
        p.resolve()
        for p in BACKEND.glob("*.py")
        if not p.name.startswith("test_") and p.name != "conftest.py"
    )
    by_module = {p.stem: p for p in files}
    graph = {p: set() for p in files}
    for source in files:
        tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [alias.name.split(".")[0] for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module.split(".")[0]]
            for name in names:
                target = by_module.get(name)
                if target:
                    graph[source].add(target)
    return graph


def find_cycles(graph):
    state = {}
    stack = []
    cycles = []

    def visit(node):
        state[node] = 1
        stack.append(node)
        for nxt in graph[node]:
            mark = state.get(nxt, 0)
            if mark == 0:
                visit(nxt)
            elif mark == 1:
                idx = stack.index(nxt)
                cycle = stack[idx:] + [nxt]
                key = tuple(str(p) for p in cycle)
                if key not in {tuple(str(p) for p in c) for c in cycles}:
                    cycles.append(cycle)
        stack.pop()
        state[node] = 2

    for node in graph:
        if state.get(node, 0) == 0:
            visit(node)
    return cycles


def report(label, graph):
    cycles = find_cycles(graph)
    edges = sum(len(v) for v in graph.values())
    print(f"{label}: {len(graph)} módulos / {edges} dependencias / {len(cycles)} ciclos")
    for cycle in cycles:
        print("  - " + " -> ".join(str(p.relative_to(ROOT)) for p in cycle))
    return bool(cycles)


def main() -> int:
    print("== Chess Studio · dependency cycle check ==")
    failed = report("Frontend", frontend_graph())
    failed |= report("Backend", backend_graph())
    if failed:
        print("dependency-cycle-check FAIL")
        return 1
    print("dependency-cycle-check OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
