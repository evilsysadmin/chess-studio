#!/usr/bin/env python3
"""High-confidence dead-module gate without installing project dependencies.

Reports whole product modules and stylesheets that cannot be reached from the
runtime entrypoint through static/dynamic relative imports. It intentionally
does not try to guess unused functions or CSS selectors: those need semantic
tools and would create noisy false positives in a static preflight.
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
CSS_IMPORT_RE = re.compile(r"@import\s+(?:url\(\s*)?['\"]?([^'\")\s;]+)")
FRONTEND_EXCLUDES = {"test-setup.js"}


def strip_resource_query(spec: str) -> str:
    return re.split(r"[?#]", spec, maxsplit=1)[0]


def resolve_js(source: Path, spec: str) -> Path | None:
    if not spec.startswith("."):
        return None
    # Vite resource queries (?raw, ?url, etc.) modify loading semantics while
    # still referring to the same repository file for reachability purposes.
    base = source.parent / strip_resource_query(spec)
    candidates = [base, *(Path(str(base) + ext) for ext in JS_EXTS), *(base / f"index{ext}" for ext in JS_EXTS)]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise RuntimeError(f"import relativo no resoluble: {source.relative_to(ROOT)} -> {spec}")


def resolve_css(source: Path, spec: str) -> Path | None:
    if not spec.startswith("."):
        return None
    clean_spec = strip_resource_query(spec)
    base = source.parent / clean_spec

    # JS modules share the same import syntax, so an extensionless `./App`
    # must not be treated as a broken CSS import. Only explicit .css imports
    # are errors when missing; extensionless specs are considered CSS solely
    # when a sibling `<spec>.css` actually exists.
    if base.suffix == ".css":
        if base.is_file():
            return base.resolve()
        raise RuntimeError(f"import CSS relativo no resoluble: {source.relative_to(ROOT)} -> {spec}")
    if base.suffix:
        return None

    css_candidate = Path(str(base) + ".css")
    if css_candidate.is_file():
        return css_candidate.resolve()
    return None


def frontend_unreachable() -> tuple[set[Path], list[Path]]:
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
    return seen, sorted(files - seen)


def css_unreachable(reachable_js: set[Path]) -> tuple[int, list[Path]]:
    files = {p.resolve() for p in FRONTEND.rglob("*.css") if p.is_file()}
    seen: set[Path] = set()
    pending: list[Path] = []

    # Only production-reachable JS may make a stylesheet production-reachable.
    # A CSS import hidden exclusively in a dead/test module must not keep the
    # stylesheet alive by accident.
    for source in reachable_js:
        text = source.read_text(encoding="utf-8")
        for spec in IMPORT_RE.findall(text):
            target = resolve_css(source, spec)
            if target in files and target not in seen:
                pending.append(target)

    # Follow CSS-to-CSS imports as well, including @import url(...).
    while pending:
        source = pending.pop()
        if source in seen or source not in files:
            continue
        seen.add(source)
        text = source.read_text(encoding="utf-8")
        for spec in CSS_IMPORT_RE.findall(text):
            target = resolve_css(source, spec)
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
    css_seen, css_dead = css_unreachable(front_seen)
    back_seen, back_dead = backend_unreachable()
    if front_dead or css_dead or back_dead:
        for path in front_dead:
            print(f"ERROR dead-code gate: frontend productivo inalcanzable: {path.relative_to(ROOT)}")
        for path in css_dead:
            print(f"ERROR dead-code gate: CSS productivo inalcanzable: {path.relative_to(ROOT)}")
        for path in back_dead:
            print(f"ERROR dead-code gate: backend productivo inalcanzable: {path.relative_to(ROOT)}")
        return 1
    print(
        "dead-code-reachability OK · "
        f"frontend {len(front_seen)} alcanzables · CSS {css_seen} alcanzables · "
        f"backend {back_seen} alcanzables · 0 módulos/hojas huérfanos"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
