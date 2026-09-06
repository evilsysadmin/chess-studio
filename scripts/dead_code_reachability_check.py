#!/usr/bin/env python3
"""High-confidence dead-module gate without installing project dependencies.

Only reports whole product modules that cannot be reached from the runtime
entrypoint through static/dynamic relative imports. It intentionally does not
try to guess unused functions or CSS selectors: those need semantic tools and
would create noisy false positives in a static preflight.
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
FRONTEND_EXCLUDES = {"test-setup.js"}


def resolve_js(source: Path, spec: str) -> Path | None:
    if not spec.startswith("."):
        return None
    # Vite resource queries (?raw, ?url, etc.) modify loading semantics while
    # still referring to the same repository file for reachability purposes.
    path_spec = re.split(r"[?#]", spec, maxsplit=1)[0]
    base = source.parent / path_spec
    candidates = [base, *(Path(str(base) + ext) for ext in JS_EXTS), *(base / f"index{ext}" for ext in JS_EXTS)]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise RuntimeError(f"import relativo no resoluble: {source.relative_to(ROOT)} -> {spec}")


def frontend_unreachable() -> tuple[int, list[Path]]:
    files = {
        p.resolve()
        for p in FRONTEND.rglob("*")
        if p.is_file()
        and p.suffix in JS_EXTS
        and ".test." not in p.name
        and p.name not in FRONTEND_EXCLUDES
    }
    entry = (FRONTEND / "main.jsx").resolve()
    seen: set[Path] = set()
    pending = [entry]
    while pending:
        source = pending.pop()
        if source in seen or source not in files:
            continue
        seen.add(source)
        text = source.read_text(encoding="utf-8")
        for spec in IMPORT_RE.findall(text):
            target = resolve_js(source, spec)
            if target in files and target not in seen:
                pending.append(target)
    return len(seen), sorted(files - seen)


def backend_unreachable() -> tuple[int, list[Path]]:
    files = {
        p.resolve()
        for p in BACKEND.glob("*.py")
        if not p.name.startswith("test_") and p.name != "conftest.py"
    }
    by_name = {p.stem: p for p in files}
    entry = (BACKEND / "main.py").resolve()
    seen: set[Path] = set()
    pending = [entry]
    while pending:
        source = pending.pop()
        if source in seen or source not in files:
            continue
        seen.add(source)
        tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name.split(".")[0] for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module.split(".")[0]]
            for name in names:
                target = by_name.get(name)
                if target is not None and target not in seen:
                    pending.append(target)
    return len(seen), sorted(files - seen)


def main() -> int:
    front_seen, front_dead = frontend_unreachable()
    back_seen, back_dead = backend_unreachable()
    if front_dead or back_dead:
        for path in front_dead:
            print(f"ERROR dead-code gate: frontend productivo inalcanzable: {path.relative_to(ROOT)}")
        for path in back_dead:
            print(f"ERROR dead-code gate: backend productivo inalcanzable: {path.relative_to(ROOT)}")
        return 1
    print(f"dead-code-reachability OK · frontend {front_seen} alcanzables · backend {back_seen} alcanzables · 0 módulos huérfanos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
