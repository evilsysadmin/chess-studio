#!/usr/bin/env python3
"""Run reproducible A/B/B/A War Room V3 frame-pacing captures on one local GPU.

Local operator tool, NEVER an unattended GitHub Actions GPU benchmark.
Uses detached git worktrees and an identical benchmark harness for both
revisions. No production source or runtime assets are changed.
"""
import argparse
import datetime as dt
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

SHA_RE = re.compile(r'^[0-9a-f]{40}$')
PROFILES = ('desktop-1440x900', 'touch-portrait-390x844', 'touch-landscape-844x390')
HARNESS_FILES = (
    'e2e/war-room-gpu-benchmark.spec.js', 'e2e/playwright.config.js',
    'e2e/package.json', 'e2e/package-lock.json',
)
COMPARE_PATH = 'scripts/compare_war_room_gpu.py'


class BenchError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise BenchError(message)


def run(command, *, cwd=None, env=None, stdout=None, check=True):
    # Never run a shell and never echo the inherited environment or secrets.
    result = subprocess.run(
        [str(part) for part in command], cwd=cwd, env=env,
        stdout=stdout, check=False,
    )
    if check and result.returncode:
        raise BenchError(f'Command failed with exit {result.returncode}: {command[0]}')
    return result


def capture(command, *, cwd=None):
    result = subprocess.run(
        [str(part) for part in command], cwd=cwd,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if result.returncode:
        raise BenchError(f'Cannot inspect git revision: {command[-1]}')
    return result.stdout


def resolve_sha(root, value):
    require(SHA_RE.fullmatch(value) is not None, 'Use complete 40-character commit SHAs')
    resolved = capture(('git', 'rev-parse', '--verify', value + '^{commit}'), cwd=root).decode().strip()
    require(resolved == value, f'Commit {value} is missing or is not a commit')
    return resolved


def execution_order(repetitions):
    require(2 <= repetitions <= 8, 'Choose 2..8 runs per revision')
    return tuple(item for pair in range(repetitions)
                 for item in (('A', 'B') if pair % 2 == 0 else ('B', 'A')))


def gpu_env(renderer, offload):
    require(renderer in ('hardware', 'software'), 'Unknown renderer')
    require(offload in ('nvidia', 'mesa', 'none'), 'Unknown GPU offload type')
    env = os.environ.copy()
    env['WAR_ROOM_GPU_BENCH'] = '1'
    env['WAR_ROOM_GPU_BENCH_RENDERER'] = renderer
    # An explicitly selected offload must win over variables leaked from a
    # previous process, which could silently bias A/B renderer selection.
    for name in ('__NV_PRIME_RENDER_OFFLOAD', '__GLX_VENDOR_LIBRARY_NAME',
                 '__VK_LAYER_NV_optimus', 'DRI_PRIME'):
        env.pop(name, None)
    if offload == 'nvidia':
        env['__NV_PRIME_RENDER_OFFLOAD'] = '1'
        env['__GLX_VENDOR_LIBRARY_NAME'] = 'nvidia'
    elif offload == 'mesa':
        env['DRI_PRIME'] = '1'
    return env


def require_port_free(host='127.0.0.1', port=4173):
    # The benchmark's Playwright server must serve the exact checkout's dist.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        if sock.connect_ex((host, port)) == 0:
            raise BenchError(f'{host}:{port} is already serving content; stop the old E2E server first')


def prepare_worktree(root, temporary, label, sha, harness_blobs):
    target = temporary / label
    print(f'==> Creating detached {label} worktree at {sha[:12]}', flush=True)
    run(('git', 'worktree', 'add', '--detach', str(target), sha), cwd=root)
    for filename, raw in harness_blobs.items():
        path = target / filename
        # Historical baseline SHAs predate the benchmark spec: safely add it.
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
    for scope in ('frontend', 'e2e'):
        print(f'==> Installing {label} {scope} dependencies', flush=True)
        run(('npm', '--prefix', str(target / scope), 'ci'), cwd=root)
    if label == 'A':
        # Both worktrees now use the identical pinned e2e lockfile.
        run((str(target / 'e2e/node_modules/.bin/playwright'), 'install', 'chromium'), cwd=root)
    print(f'==> Building exact {label} frontend', flush=True)
    run(('npm', '--prefix', str(target / 'frontend'), 'run', 'build'), cwd=root)
    return target


def exercise_once(label, target, sha, renderer, env, destination, ordinal, total):
    require_port_free()
    print(f'==> Run {ordinal}/{total}: {label} at {sha[:12]} ({renderer})', flush=True)
    prior = set((target / '.artifacts/war-room-gpu-benchmark').glob('*.json'))
    local_env = env.copy()
    local_env['WAR_ROOM_GPU_BENCH_SHA'] = sha
    run(('./node_modules/.bin/playwright', 'test', 'war-room-gpu-benchmark.spec.js',
         '--config=playwright.config.js', '--project=chromium', '--workers=1'),
        cwd=target / 'e2e', env=local_env)
    produced = sorted(set((target / '.artifacts/war-room-gpu-benchmark').glob('*.json')) - prior)
    require(len(produced) == len(PROFILES),
            f'{label}: expected {len(PROFILES)} fresh JSON captures; got {len(produced)}')
    names = set()
    for path in produced:
        try:
            report = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError) as exc:
            raise BenchError(f'Invalid capture {path}: {exc}') from exc
        require(report.get('schema') == 2 and report.get('revision') == sha,
                f'{path}: invalid capture schema/revision')
        require(report.get('requestedRenderer') == renderer, f'{path}: renderer mismatch')
        names.add(report.get('profile'))
        copied = destination / path.name
        require(not copied.exists(), f'Collision while preserving A/B capture: {copied}')
        shutil.copy2(path, copied)
    require(names == set(PROFILES), f'{label}: missing/duplicate profile {names}')


def self_test():
    assert execution_order(2) == ('A', 'B', 'B', 'A')
    assert execution_order(3) == ('A', 'B', 'B', 'A', 'A', 'B')
    for count in (0, 1, 9):
        try:
            execution_order(count)
        except BenchError:
            pass
        else:
            raise AssertionError('Unsafe iteration count accepted')
    nvidia = gpu_env('hardware', 'nvidia')
    mesa = gpu_env('hardware', 'mesa')
    clean = gpu_env('software', 'none')
    assert nvidia['__GLX_VENDOR_LIBRARY_NAME'] == 'nvidia' and 'DRI_PRIME' not in nvidia
    assert mesa['DRI_PRIME'] == '1' and '__GLX_VENDOR_LIBRARY_NAME' not in mesa
    assert '__NV_PRIME_RENDER_OFFLOAD' not in clean and 'DRI_PRIME' not in clean
    print('War Room GPU A/B local runner self-test: OK')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-sha', required=False)
    parser.add_argument('--candidate-sha', required=False)
    parser.add_argument('--harness-sha', help='SHA providing ONE identical Playwright harness for A+B (default: HEAD)')
    parser.add_argument('--renderer', choices=('hardware', 'software'), default='hardware')
    parser.add_argument('--offload', choices=('nvidia', 'mesa', 'none'), default='nvidia')
    parser.add_argument('--repetitions', type=int, default=2, help='Independent captures per revision, min 2; default 2')
    parser.add_argument('--output-root', type=Path, help='Parent for immutable session results (default .artifacts/war-room-gpu-ab)')
    parser.add_argument('--dry-run', action='store_true', help='Validate SHAs and show sequence without modifying files')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0

    root = Path(__file__).resolve().parent.parent
    try:
        require(args.baseline_sha and args.candidate_sha, 'Specify --baseline-sha and --candidate-sha')
        baseline = resolve_sha(root, args.baseline_sha)
        candidate = resolve_sha(root, args.candidate_sha)
        harness = resolve_sha(root, args.harness_sha or
                              capture(('git', 'rev-parse', 'HEAD'), cwd=root).decode().strip())
        require(baseline != candidate, 'A and B must be distinct revisions')
        order = execution_order(args.repetitions)
        require(args.renderer == 'software' or args.renderer == 'hardware', 'Renderer invalid')
        env = gpu_env(args.renderer, args.offload)
        print(f'War Room benchmark: A={baseline} B={candidate} harness={harness}', flush=True)
        print('Sequence: ' + ' → '.join(order) + f' · renderer={args.renderer} offload={args.offload}', flush=True)
        if args.dry_run:
            print('Dry run: no worktrees, build, browser or GPU comparison executed')
            return 0

        require_port_free()
        harness_blobs = {}
        for filename in (*HARNESS_FILES, COMPARE_PATH):
            harness_blobs[filename] = capture(('git', 'show', harness + ':' + filename), cwd=root)
        require(b'schema: 2' in harness_blobs[HARNESS_FILES[0]]
                and b'runId' in harness_blobs[HARNESS_FILES[0]],
                'Harness must produce schema 2, per-run JSON')
        session = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
        destination_root = (args.output_root or root / '.artifacts/war-room-gpu-ab') / session
        destination_root.mkdir(parents=True, exist_ok=False)
        (destination_root / 'A').mkdir()
        (destination_root / 'B').mkdir()
        print(f'==> Permanent benchmark results: {destination_root}', flush=True)

        with tempfile.TemporaryDirectory(prefix='chess-warroom-gpu-ab-') as tmp:
            temporary = Path(tmp)
            worktrees = {}
            try:
                for label, sha in (('A', baseline), ('B', candidate)):
                    # Append even before checkout completes, for failed-add cleanup.
                    target = temporary / label
                    worktrees[label] = target
                    prepare_worktree(root, temporary, label, sha, harness_blobs)
                for i, label in enumerate(order, start=1):
                    sha = baseline if label == 'A' else candidate
                    exercise_once(label, worktrees[label], sha, args.renderer,
                                  env, destination_root / label, i, len(order))
                comparator = temporary / 'compare_war_room_gpu.py'
                comparator.write_bytes(harness_blobs[COMPARE_PATH])
                report_path = destination_root / 'comparison.md'
                run(('python3', '-S', str(comparator),
                     '--baseline-dir', str(destination_root / 'A'),
                     '--candidate-dir', str(destination_root / 'B'),
                     '--baseline-sha', baseline, '--candidate-sha', candidate,
                     '--renderer', args.renderer, '--min-runs', str(args.repetitions),
                     '--output', str(report_path)), cwd=root)
                (destination_root / 'session.json').write_text(
                    json.dumps({
                        'schema': 1, 'baseline': baseline, 'candidate': candidate,
                        'harness': harness, 'renderer': args.renderer, 'offload': args.offload,
                        'sequence': order, 'repetitions': args.repetitions,
                        'physicalAndroidVerified': False,
                        'metric': 'browser rAF cadence (not GPU frame time)',
                    }, indent=2) + '\n', encoding='utf-8',
                )
                print(f'==> A/B report complete: {report_path}', flush=True)
            finally:
                for path in worktrees.values():
                    if path.exists():
                        run(('git', 'worktree', 'remove', '--force', str(path)),
                            cwd=root, check=False)
        return 0
    except (BenchError, OSError, ValueError) as exc:
        print('War Room A/B refused/failed: ' + str(exc), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
