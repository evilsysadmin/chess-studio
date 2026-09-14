#!/usr/bin/env python3
"""Run one canonical core Playwright lane from a single tested command table."""
from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
E2E_DIR = ROOT / 'e2e'
PLAYWRIGHT = './node_modules/.bin/playwright'

REGRESSION_STATE_GREP = (
    'sesión · dos contextos de navegador|deploy · una release nueva no fuerza reload|'
    'admin · presencia distingue|Matthias · saluda una vez tras login y no repite el saludo con F5|'
    'Home · el avatar residente de Matthias abre Así juegas|'
    'Matthias · el briefing persistente aparece antes de una partida rápida|'
    'Matthias · banco de personalidad Admin usa sólo datos sintéticos'
)
REGRESSION_STATE_INVERT = (
    'y cierra el loop jugar → entrenar → volver a jugar|'
    'entrenamiento → segunda observación real no sobreafirma mejora'
)
REGRESSION_SCHOOL_GREP = (
    'Escuela de Matthias · el primer movimiento se aprende hands-on y persiste tras F5|'
    'Escuela de Matthias · el examen básico bloquea la promoción hasta aprobar'
)
SMOKE_GREP = (
    'login → menú|Partida rápida · una partida activa|Torneo · una partida activa|'
    'Partida rápida · un 503 al restaurar|Combat Chess · Campaña permite jugar con defaults|'
    'Combat Chess · salir al menú conserva campaña'
)


@dataclass(frozen=True)
class LaneCommand:
    spec: str
    args: tuple[str, ...] = ()

    def argv(self) -> list[str]:
        return [PLAYWRIGHT, 'test', self.spec, *self.args]

    @property
    def grep(self) -> str | None:
        try:
            index = self.args.index('--grep')
        except ValueError:
            return None
        return self.args[index + 1]


LANE_COMMANDS: dict[str, tuple[LaneCommand, ...]] = {
    'regression-state': (
        LaneCommand(
            'regression-journeys.spec.js',
            (
                '--grep', REGRESSION_STATE_GREP,
                '--grep-invert', REGRESSION_STATE_INVERT,
                '--workers=1', '--retries=0', '--timeout=75000',
            ),
        ),
    ),
    'regression-school': (
        LaneCommand(
            'regression-journeys.spec.js',
            ('--grep', REGRESSION_SCHOOL_GREP, '--workers=1', '--retries=0', '--timeout=75000'),
        ),
    ),
    'learning-golden': (
        LaneCommand('learning-golden-path.spec.js', ('--workers=1', '--retries=0')),
    ),
    'learning-observation': (
        LaneCommand('learning-second-observation.spec.js', ('--workers=1', '--retries=0')),
    ),
    'smoke': (
        LaneCommand('smoke.spec.js', ('--grep', SMOKE_GREP, '--workers=1', '--retries=0')),
        LaneCommand('mobile-final-interactions.spec.js', ('--workers=1', '--retries=0')),
    ),
}


def critical_targets() -> list[tuple[str, str]]:
    return [
        (command.spec, command.grep)
        for commands in LANE_COMMANDS.values()
        for command in commands
        if command.grep is not None
    ]


def run_lane(lane: str, runner: Callable[..., object] = subprocess.run) -> None:
    try:
        commands = LANE_COMMANDS[lane]
    except KeyError as exc:
        raise ValueError(f'Lane Playwright desconocida: {lane}') from exc
    for command in commands:
        runner(command.argv(), cwd=E2E_DIR, check=True)


def self_test() -> None:
    expected = (
        'regression-state', 'regression-school', 'learning-golden', 'learning-observation', 'smoke',
    )
    assert tuple(LANE_COMMANDS) == expected
    assert len(critical_targets()) == 3
    assert [command.spec for command in LANE_COMMANDS['smoke']] == [
        'smoke.spec.js', 'mobile-final-interactions.spec.js'
    ]
    assert '--grep-invert' in LANE_COMMANDS['regression-state'][0].args
    assert all(command.spec.endswith('.spec.js') for commands in LANE_COMMANDS.values() for command in commands)

    calls: list[tuple[list[str], Path, bool]] = []

    def fake_runner(argv: list[str], *, cwd: Path, check: bool) -> None:
        calls.append((argv, cwd, check))

    run_lane('learning-golden', fake_runner)
    assert calls == [
        ([PLAYWRIGHT, 'test', 'learning-golden-path.spec.js', '--workers=1', '--retries=0'], E2E_DIR, True)
    ]

    try:
        run_lane('unknown', fake_runner)
    except ValueError as exc:
        assert 'Lane Playwright desconocida' in str(exc)
    else:
        raise AssertionError('una lane desconocida debe fallar cerrado')

    print('core-e2e-lane self-test: OK')


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('lane', nargs='?')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args(argv)

    if args.self_test:
        self_test()
        return 0
    if not args.lane:
        parser.error('lane is required unless --self-test is used')
    try:
        run_lane(args.lane)
    except ValueError as exc:
        print(f'::error::{exc}', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
