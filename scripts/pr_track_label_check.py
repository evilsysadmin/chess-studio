#!/usr/bin/env python3
"""GP-0 (#34 · Código Rojo): toda PR declara su pista con una etiqueta.

Pistas válidas: `ux-mobile`, `ux-desktop`, `ux-claude` o cualquier `track-*`.
Sin etiqueta de pista, la PR falla: la regla la hace cumplir CI, no el prompt.

Uso en CI: PR_LABELS_JSON='["ux-mobile", ...]' python3 -S scripts/pr_track_label_check.py
Autotest:  python3 -S scripts/pr_track_label_check.py --self-test
"""
from __future__ import annotations

import json
import os
import sys

TRACK_LABELS = frozenset({"ux-mobile", "ux-desktop", "ux-claude"})
TRACK_PREFIX = "track-"


def is_track_label(label: str) -> bool:
    name = str(label or "").strip().lower()
    return name in TRACK_LABELS or (name.startswith(TRACK_PREFIX) and len(name) > len(TRACK_PREFIX))


def missing_track(labels: list[str]) -> bool:
    return not any(is_track_label(label) for label in labels)


def parse_labels(raw: str | None) -> list[str]:
    if not raw:
        return []
    value = json.loads(raw)
    if not isinstance(value, list):
        raise ValueError("PR_LABELS_JSON debe ser una lista JSON de nombres")
    return [str(item) for item in value]


def self_test() -> None:
    assert not missing_track(["ux-mobile"])
    assert not missing_track(["mobile-golden-path", "ux-claude"])
    assert not missing_track(["track-ci"])
    assert not missing_track(["Track-PvP"])
    assert missing_track([])
    assert missing_track(["mobile-golden-path", "on-hold", "needs-human"])
    assert missing_track(["track-"])
    assert parse_labels('["a", "b"]') == ["a", "b"]
    assert parse_labels("") == []
    try:
        parse_labels('{"a": 1}')
    except ValueError:
        pass
    else:
        raise AssertionError("non-list label payload must fail")
    print("pr-track-label self-test: OK")


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        self_test()
        return 0
    labels = parse_labels(os.environ.get("PR_LABELS_JSON"))
    if missing_track(labels):
        allowed = ", ".join(sorted(TRACK_LABELS)) + f", {TRACK_PREFIX}*"
        print(f"::error::PR sin etiqueta de pista. Añade una de: {allowed}. Etiquetas actuales: {labels or 'ninguna'}")
        return 1
    print(f"pr-track-label OK · {', '.join(label for label in labels if is_track_label(label))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
