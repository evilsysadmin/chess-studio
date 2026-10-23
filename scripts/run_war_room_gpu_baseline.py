#!/usr/bin/env python3
"""Capture a real-GPU War Room V3/V4 sustained-render baseline at one revision.

This is NOT an A/B test. Hardware timings only come from a local GPU; the
standard CI self-test uses synthetic data solely for validation.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import statistics
import sys
import tempfile
import uuid
from pathlib import Path

from compare_war_room_gpu import (
    BadReport, PROFILES, VISITS, fake_report, gpu_phase_median, load_group,
    render_phase_median, shadow_phase_median, shadow_family_phase_median, validate_capture_provenance,
)
from run_war_room_gpu_ab import (
    BenchError, HARNESS_FILES, capture, exercise_once, gpu_env,
    prepare_worktree, require, require_port_free, resolve_sha, run,
)


def baseline_report(directory, sha, mode, variant, repetitions):
    """Summarize real submissions; reject missing/overflowed runtime journals."""
    groups, renderer, recorded_variant = load_group(directory, sha, mode, repetitions)
    require(recorded_variant == variant, 'Room variant differs from baseline request')
    require(validate_capture_provenance(groups, groups),
            'Browser, canvas, DPR, or Hans stage provenance is incomplete')
    lines = [
        f'# War Room {variant.upper()} · single-revision sustained-render baseline',
        '',
        f'Revision: `{sha}`',
        f'Renderer: {renderer} · requested mode: {mode}',
        f'Independent captures per profile: {repetitions}',
        '',
        'These values represent actual Three.js renderer.render() calls, not rAF '
        'ticks, full-frame CPU cost, or FPS. The CPU column measures only the '
        'renderer.render() invocation; GPU elapsed is a separate asynchronous query.',
        '',
        '| Profile · visit · phase | Draw calls median | Draw calls p95 | '
        'Triangles median | CPU submit median (ms) | CPU submit p95 (ms) | '
        'GPU elapsed median (ms) | Min rendered frames |',
        '|---|---:|---:|---:|---:|---:|---:|---:|',
    ]
    for profile in PROFILES:
        for report in groups[profile]:
            require(report.get('bootstrapMode') == 'persisted-e2e-session-v1',
                    f'{profile}: legacy login bootstrap is not a valid sustained baseline')
        for visit in VISITS:
            for phase in ('idle', 'move'):
                values = []
                min_count = None
                for field in ('callsMedian', 'callsP95', 'trianglesMedian',
                              'cpuSubmitMedianMs', 'cpuSubmitP95Ms'):
                    value, frames = render_phase_median(groups[profile], visit, phase, field)
                    require(value is not None and frames is not None,
                            f'{profile}/{visit}/{phase}: no complete real-render journal; '
                            'check runtime revision, sample count or overflow')
                    values.append(value)
                    min_count = frames if min_count is None else min(min_count, frames)
                gpu = gpu_phase_median(groups[profile], visit, phase) if mode == 'hardware' else None
                gpu_label = f'{gpu:.3f}' if gpu is not None else 'n/a'
                columns = ' | '.join(f'{number:.2f}' for number in values)
                lines.append(f'| {profile} · {visit} · {phase} | {columns} | '
                             f'{gpu_label} | {min_count} |')
    lines.extend([
        '',
        '## Measured shadow-depth versus main-scene submissions',
        '',
        'Draws in the existing Three.js shadowMap.render pass are counted '
        'separately from main-scene draws. No additional passes or GPU '
        'queries are issued. Missing or legacy splits show n/a, not zero.',
        '',
        '| Profile · visit · phase | Main draw calls median | '
        'Shadow draw calls median | Shadow draw calls p95 | '
        'Shadow-map invocations median |',
        '|---|---:|---:|---:|---:|',
    ])
    for profile in PROFILES:
        for visit in VISITS:
            for phase in ('idle', 'move'):
                metrics = ('mainCallsMedian', 'shadowCallsMedian',
                           'shadowCallsP95', 'shadowPassesMedian')
                values = [shadow_phase_median(groups[profile], visit, phase, field)[0]
                          for field in metrics]
                formatted = [f'{value:.2f}' if value is not None else 'n/a'
                             for value in values]
                lines.append(f'| {profile} · {visit} · {phase} | '
                             + ' | '.join(formatted) + ' |')
    lines.extend([
        '',
        '## Measured shadow draw calls by object family',
        '',
        'This per-object census is active only during the optional profiler '
        'and counts real renderBufferDirect submissions inside the shadow pass. '
        'Piece silhouettes, original Blender shell, and other casters are '
        'measured separately; missing or inconsistent totals are n/a.',
        '',
        '| Profile · visit · phase | Chess piece shadow calls | '
        'Blender GLB shadow calls | Other shadow calls |',
        '|---|---:|---:|---:|',
    ])
    for profile in PROFILES:
        for visit in VISITS:
            for phase in ('idle', 'move'):
                metrics = ('shadowPieceCallsMedian', 'shadowShellCallsMedian',
                           'shadowOtherCallsMedian')
                values = [shadow_family_phase_median(groups[profile], visit, phase, metric)[0]
                          for metric in metrics]
                cells = [f'{value:.2f}' if value is not None else 'n/a'
                         for value in values]
                lines.append(f'| {profile} · {visit} · {phase} | '
                             + ' | '.join(cells) + ' |')
    lines.extend([
        '',
        '## Static GLB and lighting census (not draw calls)',
        '',
        'One-shot runtime telemetry observed after the room and Hans become ready. '
        'Shell shadow candidate count is the subset considered by the '
        'runtime shadow selector, NOT the complete authored GLB mesh census. '
        'Use the immutable-R2 geometry report for authored topology. '
        'Instanced torch batches are additional runtime meshes. '
        'One candidate does not necessarily equal one WebGL draw, because '
        'culling, materials and shadow passes affect submissions.',
        '',
        '| Profile · visit | Shell shadow candidate meshes | V3 static torch batches | '
        'Shadow caster budget | Candidate shadow triangles | '
        'Selected shadow triangles | Observed casters | Shadow warmup stage |',
        '|---|---:|---:|---:|---:|---:|---:|---|',
    ])
    for profile in PROFILES:
        for index, visit in enumerate(VISITS):
            captures = [report['visits'][index].get('sceneInventory')
                        for report in groups[profile]]
            fields = ('shadowCasterCandidates', 'v3StaticTorchBatches',
                      'shadowCasterBudget', 'shadowCandidatePotentialTriangles',
                      'shadowSelectedPotentialTriangles', 'activeShadowCasters')
            values = []
            for field in fields:
                # Early baselines mislabeled *shadow candidates* as authored
                # meshes. Recover their actual meaning without presenting
                # them as the full GLB loader mesh count.
                readings = [
                    (capture.get(field, capture.get('authoredGlbMeshes'))
                     if field == 'shadowCasterCandidates' else capture.get(field))
                    if isinstance(capture, dict) else None for capture in captures
                ]
                if all(type(value) is int and value >= 0 for value in readings):
                    values.append(str(readings[0]) if len(set(readings)) == 1
                                  else f'{min(readings)}–{max(readings)}')
                else:
                    values.append('n/a')
            stages = [capture.get('shadowWarmup') if isinstance(capture, dict)
                      else None for capture in captures]
            stage = stages[0] if stages and all(
                isinstance(item, str) and item == stages[0] for item in stages
            ) else 'n/a/mixed'
            # Zero selected triangles is meaningful only if the shadow ranking
            # completed. A disabled/pending pass is not evidence of zero GPU
            # shadow work; do not present it as a successful measurement.
            if stage.startswith('disabled-'):
                values[4] = 'disabled'
            elif stage == 'deferred-after-first-paint':
                values[4] = 'pending'
            elif stage != 'ready-budgeted':
                values[4] = 'n/a/mixed' if stage == 'n/a/mixed' else 'n/a'
            lines.append(f'| {profile} · {visit} | ' + ' | '.join(values)
                         + f' | {stage} |')
    lines.extend([
        '',
        'Candidate/selected shadow triangles are potential mesh geometry at '
        'one instant, **not** triangles rasterized or shadow draw calls. '
        'Selected counts are shown only after ready-budgeted warmup; disabled '
        'and pending passes are labelled instead of masquerading as zero. '
        'Observed caster counts are also snapshots, not per-frame draws. '
        'Missing fields are n/a; mixed captures retain ranges rather than '
        'silently fabricating a stable room topology.',
    ])
    lines.extend([
        '',
        '## WebGL resource snapshots on first and return visits',
        '',
        'These are renderer.info-memory counters observed in the live scene, '
        '**not** process VRAM, proof of a leak, or a post-dispose measurement. '
        'The return visit reuses the browser context but opens a new page. '
        'Missing/zero legacy counters are n/a, never evidence of zero resources.',
        '',
        '| Profile · visit | Geometries | Textures | Shader programs |',
        '|---|---:|---:|---:|',
    ])
    for profile in PROFILES:
        for index, visit in enumerate(VISITS):
            snapshots = [report['visits'][index].get('snapshotMemory')
                         for report in groups[profile]]
            cells = []
            for key in ('geometries', 'textures', 'programs'):
                readings = [snap.get(key) if isinstance(snap, dict) else None
                            for snap in snapshots]
                # Legacy harness coerced missing canvas data-attributes to 0.
                # A positive observation is required for a usable counter.
                if readings and all(type(value) is int and value > 0
                                    for value in readings):
                    cells.append(str(readings[0]) if len(set(readings)) == 1
                                 else f'{min(readings)}–{max(readings)}')
                else:
                    cells.append('n/a')
            lines.append(f'| {profile} · {visit} | ' + ' | '.join(cells) + ' |')
    lines.extend([
        '',
        'GPU timing is **n/a** when asynchronous WebGL2 query coverage is '
        'insufficient, disjoint, or unavailable. No GPU time is inferred from rAF.',
        'Touch profiles are browser emulations on this computer, **not physical Android**.',
        'This is a descriptive baseline, **not evidence of an FPS gain or A/B significance**.',
    ])
    return '\n'.join(lines) + '\n'


def self_test():
    sha = 'a' * 40
    with tempfile.TemporaryDirectory(prefix='warroom-baseline-selftest-') as folder:
        root = Path(folder)
        for profile in PROFILES:
            for index in range(2):
                report = fake_report(sha, profile, f'00000000-0000-4000-8000-{index:012x}')
                report['bootstrapMode'] = 'persisted-e2e-session-v1'
                for visit in report['visits']:
                    visit['snapshotMemory'] = {
                        'geometries': 80 + index, 'textures': 14,
                        'programs': 7,
                    }
                    for phase in ('idle', 'move'):
                        visit[phase]['renderCost'] = {
                            'status': 'ready', 'renderedFrames': 22,
                            'callsMedian': 140, 'callsP95': 150,
                            'trianglesMedian': 280000,
                            'cpuSubmitMedianMs': 1.25,
                            'cpuSubmitP95Ms': 2.50,
                            'shadowSplitStatus': 'ready',
                            'mainCallsMedian': 35, 'shadowCallsMedian': 105,
                            'shadowCallsP95': 115, 'shadowPassesMedian': 1,
                            'shadowFamiliesStatus': 'ready',
                            'shadowPieceCallsMedian': 90,
                            'shadowShellCallsMedian': 10,
                            'shadowOtherCallsMedian': 5,
                        }
                (root / f'{profile}-{index}.json').write_text(json.dumps(report))
        for path in root.glob('*.json'):
            report = json.loads(path.read_text())
            for visit in report['visits']:
                visit['sceneInventory'] = {
                    'shadowCasterCandidates': 75, 'v3StaticTorchBatches': 12,
                    'shadowCasterBudget': 32, 'activeShadowCasters': 32,
                    'shadowCandidatePotentialTriangles': 94754,
                    'shadowSelectedPotentialTriangles': 38400,
                    'shadowWarmup': 'ready-budgeted',
                }
            path.write_text(json.dumps(report))
        output = baseline_report(root, sha, 'hardware', 'v3', 2)
        assert '| desktop-1440x900 · first-visit | 75 | 12 | 32 | 94754 | 38400 | 32 | ready-budgeted |' in output
        assert '| desktop-1440x900 · first-visit · idle | 140.00 | 150.00 | ' in output
        assert '| 280000.00 | 1.25 | 2.50 | n/a | 22 |' in output
        assert '| desktop-1440x900 · first-visit · idle | 35.00 | 105.00 | 115.00 | 1.00 |' in output
        assert '| desktop-1440x900 · first-visit · idle | 90.00 | 10.00 | 5.00 |' in output
        assert '| desktop-1440x900 · first-visit | 80–81 | 14 | 7 |' in output
        path = root / 'desktop-1440x900-0.json'
        report = json.loads(path.read_text())
        report['visits'][0]['snapshotMemory']['programs'] = 0
        path.write_text(json.dumps(report))
        assert '| desktop-1440x900 · first-visit | 80–81 | 14 | n/a |' in baseline_report(root, sha, 'hardware', 'v3', 2)
        report['visits'][0]['snapshotMemory']['programs'] = 7
        report['visits'][0]['snapshotMemory']['textures'] = None
        path.write_text(json.dumps(report))
        assert '| desktop-1440x900 · first-visit | 80–81 | n/a | 7 |' in baseline_report(root, sha, 'hardware', 'v3', 2)
        report['visits'][0]['snapshotMemory']['textures'] = 14
        report['visits'][0]['sceneInventory']['shadowCasterCandidates'] = None
        path.write_text(json.dumps(report))
        assert '| desktop-1440x900 · first-visit | n/a | 12 | 32 | 94754 | 38400 | 32 | ready-budgeted |' in baseline_report(root, sha, 'hardware', 'v3', 2)
        report['visits'][0]['sceneInventory']['shadowCasterCandidates'] = 75
        path.write_text(json.dumps(report))
        # Different measurements must not silently become a fabricated
        # stable count. Legacy captures are valid and show missing as n/a.
        report['visits'][0]['sceneInventory']['shadowCandidatePotentialTriangles'] = 92000
        path.write_text(json.dumps(report))
        assert '| 32 | 92000–94754 | 38400 | 32 | ready-budgeted |' in baseline_report(root, sha, 'hardware', 'v3', 2)
        report['visits'][0]['sceneInventory'].pop('shadowSelectedPotentialTriangles')
        path.write_text(json.dumps(report))
        assert '| 32 | 92000–94754 | n/a | 32 | ready-budgeted |' in baseline_report(root, sha, 'hardware', 'v3', 2)
        report['visits'][0]['sceneInventory']['shadowSelectedPotentialTriangles'] = 38400
        report['visits'][0]['sceneInventory']['shadowWarmup'] = 'disabled-lite'
        path.write_text(json.dumps(report))
        assert '| 32 | 92000–94754 | n/a/mixed | 32 | n/a/mixed |' in baseline_report(root, sha, 'hardware', 'v3', 2)
        report['visits'][0]['sceneInventory']['shadowWarmup'] = 'ready-budgeted'
        for report_path in root.glob('*.json'):
            raw = json.loads(report_path.read_text())
            for visit in raw['visits']:
                visit['sceneInventory']['shadowWarmup'] = 'disabled-lite'
            report_path.write_text(json.dumps(raw))
        assert '| 32 | 92000–94754 | disabled | 32 | disabled-lite |' in baseline_report(root, sha, 'hardware', 'v3', 2)
        for report_path in root.glob('*.json'):
            raw = json.loads(report_path.read_text())
            for visit in raw['visits']:
                visit['sceneInventory']['shadowWarmup'] = 'ready-budgeted'
            report_path.write_text(json.dumps(raw))
        report = json.loads(path.read_text())
        report['visits'][0]['idle']['renderCost'] = {
            'status': 'overflow', 'renderedFrames': 22,
        }
        path.write_text(json.dumps(report))
        try:
            baseline_report(root, sha, 'hardware', 'v3', 2)
        except BenchError as exc:
            assert 'no complete real-render journal' in str(exc)
        else:
            raise AssertionError('Overflowed renderer journal accepted')
        report['visits'][0]['idle'].pop('renderCost')
        path.write_text(json.dumps(report))
        try:
            baseline_report(root, sha, 'hardware', 'v3', 2)
        except BenchError as exc:
            assert 'no complete real-render journal' in str(exc)
        else:
            raise AssertionError('Missing renderer journal accepted')
    print('War Room single-revision GPU baseline self-test: OK')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision-sha', help='Revision to measure (default: HEAD)')
    parser.add_argument('--variant', choices=('v3', 'v4'), default='v3')
    parser.add_argument('--renderer', choices=('hardware', 'software'), default='hardware')
    parser.add_argument('--offload', choices=('nvidia', 'mesa', 'none'), default='nvidia')
    parser.add_argument('--repetitions', type=int, default=2,
                        help='Independent captures at this revision, default 2; 1..8')
    parser.add_argument('--output-root', type=Path,
                        help='Default .artifacts/war-room-gpu-baseline')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    root = Path(__file__).resolve().parent.parent
    try:
        require(1 <= args.repetitions <= 8, 'Baseline repetitions must be 1..8')
        current = capture(('git', 'rev-parse', 'HEAD'), cwd=root).decode().strip()
        harness = resolve_sha(root, current)
        revision = resolve_sha(root, args.revision_sha or current)
        env = gpu_env(args.renderer, args.offload)
        env['WAR_ROOM_GPU_BENCH_VARIANT'] = args.variant
        print(f'War Room sustained baseline · revision={revision} harness={harness} '
              f'variant={args.variant} renderer={args.renderer} '
              f'offload={args.offload} repeats={args.repetitions}', flush=True)
        if args.dry_run:
            print('Dry run: no worktree, build, GPU capture or report executed.')
            return 0
        require_port_free()
        harness_blobs = {
            path: capture(('git', 'show', f'{harness}:{path}'), cwd=root)
            for path in HARNESS_FILES
        }
        require(b'renderCost' in harness_blobs['e2e/war-room-gpu-benchmark.spec.js'],
                'The current harness must capture real per-render costs')
        # Historical commits are allowed only if they really include the
        # opt-in journal. Never "backfill" older runtime measurements by
        # replacing their Playwright test files with modern harness files.
        runtime = capture(('git', 'show',
                           f'{revision}:frontend/src/components/WarRoomGpuProfile.js'), cwd=root)
        require(b'recordRender' in runtime,
                'Selected runtime predates real-render instrumentation; use a newer SHA')
        session = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        session += '-' + uuid.uuid4().hex[:8]
        destination = (args.output_root or root / '.artifacts/war-room-gpu-baseline') / session
        destination.mkdir(parents=True, exist_ok=False)
        captures = destination / 'A'
        captures.mkdir()
        manifest = destination / 'session.json'
        metadata = {
            'schema': 1, 'revision': revision, 'harness': harness,
            'variant': args.variant, 'renderer': args.renderer,
            'offload': args.offload, 'repetitions': args.repetitions,
            'status': 'incomplete', 'physicalAndroidVerified': False,
        }
        manifest.write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
        print(f'==> Results: {destination}', flush=True)
        with tempfile.TemporaryDirectory(prefix='chess-warroom-gpu-baseline-') as tmp:
            temporary = Path(tmp)
            worktree = temporary / 'A'
            try:
                prepare_worktree(root, temporary, 'A', revision, harness_blobs)
                for index in range(1, args.repetitions + 1):
                    exercise_once('A', worktree, revision, args.renderer,
                                  env, captures, index, args.repetitions)
                output = baseline_report(captures, revision, args.renderer,
                                         args.variant, args.repetitions)
                (destination / 'baseline.md').write_text(output, encoding='utf-8')
                metadata['status'] = 'complete'
                manifest.write_text(json.dumps(metadata, indent=2) + '\n',
                                    encoding='utf-8')
                print(f'==> Sustained baseline complete: {destination / "baseline.md"}', flush=True)
            finally:
                if worktree.exists():
                    run(('git', 'worktree', 'remove', '--force', str(worktree)),
                        cwd=root, check=False)
        return 0
    except (BenchError, BadReport, OSError, ValueError) as exc:
        print('War Room sustained baseline refused/failed: ' + str(exc),
              file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
