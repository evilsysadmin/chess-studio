#!/usr/bin/env python3
"""High-confidence dead-module gate without installing project dependencies.

Reports whole product modules and stylesheets that cannot be reached from the
runtime entrypoints through static/dynamic relative imports. It also reports a
narrow class of dead frontend exports when the symbol has no external named
consumer, no internal reference and no opaque namespace/dynamic consumer.
CSS selectors and ambiguous symbols remain outside this no-dependency gate.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend" / "src"
BACKEND = ROOT / "backend-python"
SCRIPTS = ROOT / "scripts"
JS_EXTS = (".js", ".jsx", ".mjs")
IMPORT_RE = re.compile(r"(?:(?:import|export)\s+(?:[^'\"]*?\s+from\s+)?|import\s*\()\s*['\"]([^'\"]+)['\"]")
CSS_IMPORT_RE = re.compile(r"@import\s+(?:url\(\s*)?['\"]?([^'\")\s;]+)")
EXPORT_DECL_RE = re.compile(r"\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)")
NAMED_FROM_RE = re.compile(
    r"(?:import\s+(?:[A-Za-z_$][A-Za-z0-9_$]*\s*,\s*)?|export\s+)"
    r"\{([^}]*)\}\s+from\s+['\"]([^'\"]+)['\"]",
    re.DOTALL,
)
OPAQUE_FROM_RE = re.compile(
    r"(?:import\s+\*\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*|"
    r"export\s+\*(?:\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*)?)"
    r"\s+from\s+['\"]([^'\"]+)['\"]"
)
DYNAMIC_IMPORT_RE = re.compile(r"\bimport\s*\(\s*['\"]([^'\"]+)['\"]\s*\)")
REQUIRE_RE = re.compile(r"\brequire\s*\(\s*['\"]([^'\"]+)['\"]\s*\)")
UVICORN_ENTRY_RE = re.compile(r"\buvicorn\s+([A-Za-z_][A-Za-z0-9_]*):[A-Za-z_][A-Za-z0-9_]*")
FRONTEND_EXCLUDES = {"test-setup.js"}
FRONTEND_DEAD_EXPORT_BASELINE = {
    "frontend/src/ambientIdentityContrasts.js::IDENTITY_CONTRAST_IDS",
    "frontend/src/ambientRadioMatthiasRecompositions.js::RADIO_MATTHIAS_MELODIC_REWRITE_IDS",
    "frontend/src/chesscomEnvironmentArtV4.js::CHESSCOM_ENVIRONMENT_ART_V4",
    "frontend/src/chesscomMaterialArtV7.js::CHESSCOM_MATERIAL_ART_V7",
    "frontend/src/chesscomOverlayArtV6.js::CHESSCOM_OVERLAY_ART_V6",
    "frontend/src/chronicles/chroniclesMapCatalog.js::chroniclesMapEnemyById",
    "frontend/src/chronicles/chroniclesMapCatalog.js::chroniclesMapInteractable",
    "frontend/src/chroniclesOfMatthias.js::chroniclesEnemyAlive",
    "frontend/src/chroniclesOfMatthias.js::chroniclesFrontCell",
    "frontend/src/chroniclesOfMatthiasProgression.js::resetChroniclesCharacterBuild",
    "frontend/src/chroniclesOfMatthiasTactics.js::CHRONICLES_TACTICS_WORLD",
    "frontend/src/chroniclesOfMatthiasTactics.js::chroniclesTacticsWait",
    "frontend/src/combatEconomyBalance.js::COMBAT_CAMPAIGN_ECONOMY",
    "frontend/src/components/WarRoomCampaignArt.js::WAR_ROOM_CAMPAIGN_ART_KEYS",
    "frontend/src/components/WarRoomHansActor.js::acquireWarRoomHansRoutine",
    "frontend/src/components/WarRoomHansActor.js::releaseWarRoomHansRoutine",
    "frontend/src/components/WarRoomHansActor.js::warRoomHansRoutineAvailable",
    "frontend/src/pawnTrailblazerSprites.js::trailSprite",
    "frontend/src/puzzleStateMachine.js::assertPuzzleInvariant",
    "frontend/src/puzzleTacticalQuality.js::bestShallowTacticalScore",
    "frontend/src/puzzleTacticalQuality.js::tacticalScoreForFirstMove",
}


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



def _js_identifier_occurrences(text: str, name: str) -> int:
    pattern = re.compile(
        rf"(?<![A-Za-z0-9_$]){re.escape(name)}(?![A-Za-z0-9_$])"
    )
    return len(pattern.findall(text))


def _named_imports(clause: str) -> set[str]:
    names: set[str] = set()
    for raw in clause.split(","):
        token = re.sub(r"/\*.*?\*/", "", raw, flags=re.DOTALL).strip()
        if token.startswith("type "):
            token = token[5:].strip()
        if not token:
            continue
        imported = re.split(r"\s+as\s+", token, maxsplit=1)[0].strip()
        if imported and imported != "default":
            names.add(imported)
    return names


def frontend_dead_exports(reachable_js: set[Path]) -> list[tuple[Path, str]]:
    """Return only exports that are dead with high static confidence.

    We inspect direct named export declarations in production-reachable modules.
    Tests and repository scripts count as consumers, so a test/debug API is not
    reported merely because production does not import it. Namespace imports,
    export-star, require() and dynamic import() make the target opaque and opt
    the whole module out rather than guessing property usage.
    """
    candidates: dict[Path, set[str]] = {}
    module_text: dict[Path, str] = {}
    for path in reachable_js:
        text = path.read_text(encoding="utf-8")
        names = set(EXPORT_DECL_RE.findall(text))
        if names:
            candidates[path] = names
            module_text[path] = text
    if not candidates:
        return []

    named_consumers: dict[Path, set[str]] = {path: set() for path in candidates}
    opaque_targets: set[Path] = set()
    consumer_exts = {".js", ".jsx", ".mjs", ".cjs"}
    consumers = [
        p.resolve()
        for p in ROOT.rglob("*")
        if p.is_file()
        and p.suffix in consumer_exts
        and ".git" not in p.parts
        and "node_modules" not in p.parts
    ]

    def resolve_consumer_target(source: Path, spec: str) -> Path | None:
        try:
            target = resolve_js(source, spec)
        except RuntimeError:
            # Product-reachable imports are already validated by frontend_unreachable.
            # Auxiliary scripts/tests may intentionally point at generated files.
            return None
        return target if target in candidates else None

    for source in consumers:
        try:
            text = source.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for clause, spec in NAMED_FROM_RE.findall(text):
            target = resolve_consumer_target(source, spec)
            if target is not None:
                named_consumers[target].update(_named_imports(clause))
        for regex in (OPAQUE_FROM_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE):
            for spec in regex.findall(text):
                target = resolve_consumer_target(source, spec)
                if target is not None:
                    opaque_targets.add(target)

    text_consumer_suffixes = {
        ".py", ".md", ".txt", ".json", ".yml", ".yaml", ".toml", ".ini",
        ".cfg", ".sh", ".gd", ".tscn", ".tres", ".html", ".css",
    }
    auxiliary_text: dict[Path, str] = {}
    self_path = Path(__file__).resolve()
    for source in ROOT.rglob("*"):
        if source.resolve() == self_path:
            continue
        if (
            not source.is_file()
            or source.suffix.lower() not in text_consumer_suffixes
            or ".git" in source.parts
            or "node_modules" in source.parts
            or ".venv" in source.parts
        ):
            continue
        try:
            auxiliary_text[source.resolve()] = source.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

    dead: list[tuple[Path, str]] = []
    for path, names in candidates.items():
        if path in opaque_targets:
            continue
        text = module_text[path]
        for name in sorted(names):
            if name in named_consumers[path]:
                continue
            # Static gates/build tools sometimes consume a source contract by
            # identifier text rather than a JS import. Treat any auxiliary
            # repository reference as a consumer rather than deleting through it.
            if any(_js_identifier_occurrences(other, name) > 0 for other in auxiliary_text.values()):
                continue
            # One occurrence is the declaration itself. Any second textual use
            # (including conservative comments/strings) suppresses the finding.
            if _js_identifier_occurrences(text, name) == 1:
                dead.append((path, name))
    return sorted(dead, key=lambda item: (item[0].as_posix(), item[1]))



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


def backend_entry_module_names() -> set[str]:
    """Return static backend roots, including the Docker Uvicorn entrypoint."""
    names = {"main"}
    dockerfile = BACKEND / "Dockerfile"
    if dockerfile.is_file():
        names.update(UVICORN_ENTRY_RE.findall(dockerfile.read_text(encoding="utf-8")))
    return names


def backend_unreachable() -> tuple[int, list[Path]]:
    files = {
        p.resolve()
        for p in BACKEND.glob("*.py")
        if not p.name.startswith("test_") and p.name != "conftest.py"
    }
    by_name = {p.stem: p for p in files}
    entry_names = backend_entry_module_names()
    missing_entries = sorted(name for name in entry_names if name not in by_name)
    if missing_entries:
        raise RuntimeError(
            "entrypoint backend no resoluble: " + ", ".join(missing_entries)
        )
    seen: set[Path] = set()
    pending = [by_name[name] for name in sorted(entry_names)]
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



def _has_python_main_guard(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if not isinstance(node, ast.If):
            continue
        test = node.test
        if not isinstance(test, ast.Compare) or len(test.ops) != 1 or len(test.comparators) != 1:
            continue
        left = test.left
        right = test.comparators[0]
        if (
            isinstance(left, ast.Name)
            and left.id == "__name__"
            and isinstance(test.ops[0], ast.Eq)
            and isinstance(right, ast.Constant)
            and right.value == "__main__"
        ):
            return True
    return False


def _script_python_imports(source: Path) -> set[str]:
    try:
        tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    except (SyntaxError, UnicodeDecodeError):
        return set()
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
    return imported


def script_python_helper_unreferenced() -> list[Path]:
    """High-confidence orphan helpers under scripts/.

    CLI-like files with an explicit __main__ guard are intentional entrypoints and
    are not judged here. A helper is reported only when no Python import resolves
    to it and no repository wiring/documentation mentions its path or basename.
    """
    script_files = sorted(p.resolve() for p in SCRIPTS.rglob("*.py") if p.is_file())
    parsed: dict[Path, ast.AST] = {}
    for path in script_files:
        try:
            parsed[path] = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (SyntaxError, UnicodeDecodeError):
            continue

    candidates = [
        path
        for path, tree in parsed.items()
        if path.name != "__init__.py" and not _has_python_main_guard(tree)
    ]
    if not candidates:
        return []

    all_python = sorted(
        p.resolve()
        for p in ROOT.rglob("*.py")
        if p.is_file() and ".venv" not in p.parts and "node_modules" not in p.parts
    )
    imports_by_source = {path: _script_python_imports(path) for path in all_python}

    text_suffixes = {
        ".md", ".txt", ".json", ".yml", ".yaml", ".toml", ".ini", ".cfg",
        ".sh", ".mjs", ".js", ".jsx", ".gd", ".tf", ".hcl", ".py",
    }
    wiring_files = [
        p.resolve()
        for p in ROOT.rglob("*")
        if p.is_file()
        and ".git" not in p.parts
        and "node_modules" not in p.parts
        and ".venv" not in p.parts
        and (p.name == "Makefile" or p.suffix.lower() in text_suffixes)
    ]
    wiring_text: dict[Path, str] = {}
    for path in wiring_files:
        try:
            wiring_text[path] = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

    by_stem: dict[str, list[Path]] = {}
    for path in script_files:
        by_stem.setdefault(path.stem, []).append(path)

    dead: list[Path] = []
    for candidate in candidates:
        rel = candidate.relative_to(ROOT).as_posix()
        script_rel = candidate.relative_to(SCRIPTS).with_suffix("").as_posix().replace("/", ".")
        full_module = "scripts." + script_rel
        aliases = {full_module, script_rel}
        if len(by_stem.get(candidate.stem, [])) == 1:
            aliases.add(candidate.stem)

        imported = any(
            source != candidate and any(
                module == alias or module.startswith(alias + ".")
                for module in modules
                for alias in aliases
            )
            for source, modules in imports_by_source.items()
        )
        if imported:
            continue

        explicit_tokens = {rel, candidate.name, full_module, script_rel}
        mentioned = any(
            source != candidate and any(token in text for token in explicit_tokens)
            for source, text in wiring_text.items()
        )
        if mentioned:
            continue
        dead.append(candidate)
    return dead


def main() -> int:
    front_seen, front_dead = frontend_unreachable()
    dead_exports = frontend_dead_exports(front_seen)
    dead_export_keys = {
        f"{path.relative_to(ROOT).as_posix()}::{name}"
        for path, name in dead_exports
    }
    unexpected_dead_exports = sorted(dead_export_keys - FRONTEND_DEAD_EXPORT_BASELINE)
    stale_dead_export_baseline = sorted(FRONTEND_DEAD_EXPORT_BASELINE - dead_export_keys)
    css_seen, css_dead = css_unreachable(front_seen)
    back_seen, back_dead = backend_unreachable()
    script_dead = script_python_helper_unreferenced()
    if (
        front_dead
        or unexpected_dead_exports
        or stale_dead_export_baseline
        or css_dead
        or back_dead
        or script_dead
    ):
        for path in front_dead:
            print(f"ERROR dead-code gate: frontend productivo inalcanzable: {path.relative_to(ROOT)}")
        for key in unexpected_dead_exports:
            print(f"ERROR dead-code gate: export frontend muerto nuevo: {key}")
        for key in stale_dead_export_baseline:
            print(
                f"ERROR dead-code gate: baseline de export muerto ya retirada; "
                f"borra la entrada del ratchet: {key}"
            )
        for path in css_dead:
            print(f"ERROR dead-code gate: CSS productivo inalcanzable: {path.relative_to(ROOT)}")
        for path in back_dead:
            print(f"ERROR dead-code gate: backend productivo inalcanzable: {path.relative_to(ROOT)}")
        for path in script_dead:
            print(f"ERROR dead-code gate: helper Python sin entrypoint/consumidor: {path.relative_to(ROOT)}")
        return 1
    print(
        "dead-code-reachability OK · "
        f"frontend {len(front_seen)} alcanzables · "
        f"dead-export baseline {len(FRONTEND_DEAD_EXPORT_BASELINE)} exacta · "
        f"CSS {css_seen} alcanzables · backend {back_seen} alcanzables · "
        f"scripts Python 0 helpers huérfanos · 0 módulos/hojas huérfanos"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
