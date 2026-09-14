#!/usr/bin/env python3
"""List the files a pull request contributes to GitHub's synthetic merge commit."""
from __future__ import annotations

import argparse
import subprocess
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


def changed_files(root: Path, base_sha: str, merge_sha: str) -> list[str]:
    if not base_sha or not merge_sha:
        raise DiffError('faltan BASE_SHA/MERGE_SHA')

    _git(root, 'cat-file', '-e', f'{base_sha}^{{commit}}')
    _git(root, 'cat-file', '-e', f'{merge_sha}^{{commit}}')
    first_parent = _git(root, 'rev-parse', f'{merge_sha}^1')
    if first_parent != base_sha:
        raise DiffError(f'el primer padre del merge ({first_parent}) no coincide con base ({base_sha})')
    _git(root, 'rev-parse', f'{merge_sha}^2')

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
        ancestor = _git(root, 'rev-parse', 'HEAD')

        _git(root, 'checkout', '-qb', 'feature')
        (root / 'feature.txt').write_text('feature\n', encoding='utf-8')
        _git(root, 'add', '.')
        _git(root, 'commit', '-qm', 'feature')

        _git(root, 'checkout', '-q', 'master')
        (root / 'main.txt').write_text('main advanced\n', encoding='utf-8')
        _git(root, 'add', '.')
        _git(root, 'commit', '-qm', 'main advanced')
        base = _git(root, 'rev-parse', 'HEAD')
        _git(root, 'merge', '--no-ff', 'feature', '-qm', 'synthetic merge')
        merge = _git(root, 'rev-parse', 'HEAD')

        assert changed_files(root, base, merge) == ['feature.txt']
        try:
            changed_files(root, ancestor, merge)
        except DiffError as exc:
            assert 'primer padre' in str(exc)
        else:
            raise AssertionError('una base que no es el primer padre debe fallar cerrada')

        try:
            changed_files(root, ancestor, base)
        except DiffError:
            pass
        else:
            raise AssertionError('un commit no-merge no puede actuar como merge sintético')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--base')
    parser.add_argument('--merge')
    parser.add_argument('--root', default='.')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()

    if args.self_test:
        self_test()
        print('pr-merge-diff self-test: OK · base→merge excluye avances ajenos de main')
        return 0

    try:
        files = changed_files(Path(args.root).resolve(), args.base or '', args.merge or '')
    except DiffError as exc:
        print(f'pr merge diff no fiable: {exc}')
        return 2

    if files:
        print('\n'.join(files))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
