#!/usr/bin/env python3
"""List the files a pull request contributes to GitHub's synthetic merge commit."""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path


class DiffError(RuntimeError):
    pass


def _git(root: Path, *args: str) -> str:
    try:
        result = subprocess.run(
            ['git', *args],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or '').strip()
        raise DiffError(detail or f"git {' '.join(args)} falló") from exc
    return result.stdout.strip()


def merge_parents(root: Path, merge_sha: str) -> tuple[str, str]:
    if not merge_sha:
        raise DiffError('falta MERGE_SHA')
    _git(root, 'cat-file', '-e', f'{merge_sha}^{{commit}}')
    parents = _git(root, 'show', '-s', '--format=%P', merge_sha).split()
    if len(parents) != 2:
        raise DiffError('el SHA probado no es un merge sintético de exactamente dos padres')
    return parents[0], parents[1]


def changed_files(root: Path, merge_sha: str) -> list[str]:
    base_sha, _ = merge_parents(root, merge_sha)
    output = _git(root, 'diff', '--name-only', base_sha, merge_sha)
    return [line for line in output.splitlines() if line]


def self_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _git(root, 'init', '-q')
        _git(root, 'config', 'user.email', 'ci@example.invalid')
        _git(root, 'config', 'user.name', 'CI self-test')
        (root / 'base.txt').write_text('base\n', encoding='utf-8')
        _git(root, 'add', '.')
        _git(root, 'commit', '-qm', 'base')

        _git(root, 'checkout', '-qb', 'feature')
        (root / 'feature.txt').write_text('feature\n', encoding='utf-8')
        _git(root, 'add', '.')
        _git(root, 'commit', '-qm', 'feature')
        feature = _git(root, 'rev-parse', 'HEAD')

        _git(root, 'checkout', '-q', 'master')
        (root / 'main.txt').write_text('main advanced\n', encoding='utf-8')
        _git(root, 'add', '.')
        _git(root, 'commit', '-qm', 'main advanced')
        base = _git(root, 'rev-parse', 'HEAD')
        _git(root, 'merge', '--no-ff', 'feature', '-qm', 'synthetic merge')
        merge = _git(root, 'rev-parse', 'HEAD')

        assert merge_parents(root, merge) == (base, feature)
        assert changed_files(root, merge) == ['feature.txt']

        try:
            changed_files(root, base)
        except DiffError as exc:
            assert 'exactamente dos padres' in str(exc)
        else:
            raise AssertionError('un commit no-merge no puede actuar como merge sintético')

    print('pr-merge-diff self-test: OK · primer padre del merge define la base probada')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        '--base',
        help='base del evento (sólo diagnóstico; en reruns puede quedar obsoleta)',
    )
    parser.add_argument('--merge')
    parser.add_argument('--root', default='.')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    root = Path(args.root).resolve()
    try:
        actual_base, _ = merge_parents(root, args.merge or '')
        files = changed_files(root, args.merge or '')
    except DiffError as exc:
        print(f'pr merge diff no fiable: {exc}')
        return 2

    expected_base = (args.base or '').strip().lower()
    if expected_base and expected_base != actual_base.lower():
        print(
            f'aviso: base del evento {expected_base[:12]} obsoleta; '
            f'usando primer padre probado {actual_base[:12]}',
            file=sys.stderr,
        )

    if files:
        print('\n'.join(files))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
