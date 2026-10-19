#!/usr/bin/env python3
"""Compare repeated opt-in War Room V3 browser pacing and optional genuine GPU timings.

Standard-library only. Reject mixed renderer, viewport, SHA, run IDs, or
insufficient samples rather than inventing a performance result.
"""
import argparse
import json
import math
import re
import statistics
import sys
import tempfile
from pathlib import Path

PROFILES = {
    'desktop-1440x900': ({'width': 1440, 'height': 900}, False),
    'touch-portrait-390x844': ({'width': 390, 'height': 844}, True),
    'touch-landscape-844x390': ({'width': 844, 'height': 390}, True),
}
VISITS = ('first-visit', 'return-visit')
SHA_RE = re.compile(r'^[0-9a-f]{40}$')


class BadReport(ValueError):
    pass


def require(condition, explanation):
    if not condition:
        raise BadReport(explanation)


def number(value, label, *, strictly_positive=False):
    require(type(value) in (float, int) and math.isfinite(value), f'{label}: finite number required')
    require(value > 0 if strictly_positive else value >= 0, f'{label}: negative/zero value')
    return value


def load_group(directory, expected_sha, mode, minimum):
    require(SHA_RE.fullmatch(expected_sha) is not None, 'Revision must be a full 40-digit SHA')
    require(directory.is_dir(), f'Not a directory: {directory}')
    reports = {key: [] for key in PROFILES}
    seen = set()
    renderers = set()
    variants = set()
    paths = sorted(directory.glob('*.json'))
    require(paths, f'No JSON captures in {directory}')
    for path in paths:
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
        except (ValueError, OSError) as exc:
            raise BadReport(f'{path}: invalid/unreadable JSON: {exc}') from exc
        prefix = str(path) + ': '
        require(type(data) is dict, prefix + 'object required')
        require(data.get('schema') == 2, prefix + 'schema 2 with collision-safe runId required')
        # Legacy captures included form login; new runs restore E2E auth and
        # start from Home. They cannot be mixed for wall-clock comparisons.
        bootstrap_mode = data.get('bootstrapMode', 'form-login-v1')
        require(bootstrap_mode in ('form-login-v1', 'persisted-e2e-session-v1'),
                prefix + 'invalid benchmark bootstrap mode')
        # Legacy schema-2 captures predate explicit V4; they always measured V3.
        variant = data.get('variant', 'v3')
        require(type(variant) is str and variant in ('v3', 'v4'),
                prefix + 'invalid War Room variant')
        variants.add(variant)
        require(data.get('revision') == expected_sha, prefix + 'revision differs from requested SHA')
        require(data.get('requestedRenderer') == mode, prefix + 'requested renderer mismatch')
        require(type(data.get('browserFramePacingOnly')) is bool, prefix + 'frame-pacing mode declaration missing')
        require(data.get('physicalAndroidVerified') is False, prefix + 'physical Android must be measured separately')
        browser_version = data.get('browserVersion')
        if browser_version is not None:
            require(type(browser_version) is str
                    and 0 < len(browser_version) <= 128
                    and browser_version.strip() == browser_version,
                    prefix + 'invalid Chromium/browser version')
        run = data.get('runId')
        require(type(run) is str and re.fullmatch(r'[0-9a-f-]{36}', run) is not None,
                prefix + 'missing/invalid unique runId')
        profile = data.get('profile')
        require(profile in PROFILES, prefix + 'unknown profile')
        viewport, touch = PROFILES[profile]
        require(data.get('viewport') == viewport, prefix + 'viewport mismatch')
        require(data.get('emulatedTouch') is touch, prefix + 'touch mode mismatch')
        require((profile, run) not in seen, prefix + 'duplicate runId for profile')
        seen.add((profile, run))
        visits = data.get('visits')
        require(type(visits) is list and len(visits) == 2, prefix + 'two visits required')
        actual_gpu_samples = 0
        for visit, expected_visit in zip(visits, VISITS):
            where = prefix + profile + '/' + expected_visit
            require(type(visit) is dict and visit.get('visitType') == expected_visit,
                    where + ': visit ordering mismatch')
            require(visit.get('actual') == mode, where + ': actual renderer mode mismatch')
            renderer = visit.get('renderer')
            require(type(renderer) is str and renderer.strip(), where + ': renderer string required')
            renderers.add(renderer)
            # Older schema-2 reports have only canvasPixels; keep them readable
            # for rAF diagnostics but never attribute verified GPU timings.
            width, height, dpr = (
                visit.get('canvasWidth'), visit.get('canvasHeight'),
                visit.get('devicePixelRatio'),
            )
            if any(value is not None for value in (width, height, dpr)):
                require(type(width) is int and width > 0
                        and type(height) is int and height > 0,
                        where + ': invalid physical canvas dimensions')
                number(dpr, where + '/devicePixelRatio', strictly_positive=True)
                require(visit.get('canvasPixels') == width * height,
                        where + ': physical canvas pixel count inconsistent')
            if visit.get('canvasPixels') is not None:
                number(visit['canvasPixels'], where + '/canvasPixels', strictly_positive=True)
            require(type(visit.get('gpuTimerQueryMeasured')) is bool
                    and visit.get('gpuFrameTimeMs') is None,
                    where + ': GPU timing must use the explicit phase samples (never an inferred frame time)')
            require(type(visit.get('firstReady')) is dict, where + ': missing firstReady')
            number(visit['firstReady'].get('calls'), where + '/calls', strictly_positive=True)
            number(visit['firstReady'].get('triangles'), where + '/triangles', strictly_positive=True)
            number(visit.get('openToReadyWallMs'), where + '/openToReadyWallMs', strictly_positive=True)
            # Legacy reports did not record the asynchronously mounted Hans
            # stage. Retain their rAF diagnostics, but never certify their
            # queries as comparable fully-staged GPU measurements.
            hans_stage = visit.get('hansStage')
            hans_delay = visit.get('hansReadyAfterShellMs')
            if hans_stage is not None or hans_delay is not None:
                expected = 'v3-armory-hall' if variant == 'v3' else 'v4-tower-study'
                require(hans_stage in (expected + ':quick', expected + ':idle'),
                        where + ': wrong or incomplete Hans stage')
                number(hans_delay, where + '/hansReadyAfterShellMs')
            for phase in ('idle', 'move'):
                sample = visit.get(phase)
                require(type(sample) is dict, where + '/' + phase + ': sample missing')
                number(sample.get('rafIntervals'), where + '/' + phase + '/rafIntervals', strictly_positive=True)
                require(sample['rafIntervals'] >= 11, where + '/' + phase + ': insufficient frames')
                p50 = number(sample.get('rafP50Ms'), where + '/' + phase + '/p50', strictly_positive=True)
                p95 = number(sample.get('rafP95Ms'), where + '/' + phase + '/p95', strictly_positive=True)
                require(p95 >= p50, where + '/' + phase + ': percentile inversion')
                number(sample.get('elapsedMs'), where + '/' + phase + '/elapsed', strictly_positive=True)
                for field in ('rafGapsOver33Ms', 'rafGapsOver50Ms'):
                    number(sample.get(field), where + '/' + phase + '/' + field)
                require(sample['rafGapsOver50Ms'] <= sample['rafGapsOver33Ms'] <= sample['rafIntervals'],
                        where + '/' + phase + ': invalid gap counts')
                render_cost = sample.get('renderCost')
                if render_cost is not None:
                    require(type(render_cost) is dict, where + '/' + phase + ': renderCost must be object')
                    status = render_cost.get('status')
                    require(status in ('ready', 'missing', 'overflow', 'insufficient'),
                            where + '/' + phase + ': unknown real-render journal status')
                    count = render_cost.get('renderedFrames')
                    require(type(count) is int and 0 <= count <= 512,
                            where + '/' + phase + ': invalid real-render sample count')
                    if status == 'ready':
                        require(count >= 3, where + '/' + phase + ': insufficient actual renders')
                        for field in ('callsMedian', 'callsP95', 'trianglesMedian',
                                      'cpuSubmitMedianMs', 'cpuSubmitP95Ms'):
                            number(render_cost.get(field), where + '/' + phase + '/' + field)
                        require(render_cost['callsP95'] >= render_cost['callsMedian']
                                and render_cost['cpuSubmitP95Ms'] >= render_cost['cpuSubmitMedianMs'],
                                where + '/' + phase + ': inverted real-render percentiles')
                    else:
                        require(not any(field in render_cost for field in (
                            'callsMedian', 'callsP95', 'trianglesMedian',
                            'cpuSubmitMedianMs', 'cpuSubmitP95Ms')),
                            where + '/' + phase + ': partial render sample cannot claim metrics')
                gpu = sample.get('gpuTimer')
                if gpu is None:
                    continue  # Legacy schema-2 harness, rAF-only. No invented timing.
                require(type(gpu) is dict, where + '/' + phase + ': GPU timer must be an object')
                status = gpu.get('status')
                require(status in ('absent', 'sampling', 'ready', 'unsupported',
                                   'software', 'disjoint', 'error', 'invalid'),
                        where + '/' + phase + ': GPU timer status unrecognised')
                values = gpu.get('samplesMs')
                require(type(values) is list and len(values) <= 500,
                        where + '/' + phase + ': invalid GPU query sample collection')
                for index, value in enumerate(values):
                    number(value, where + '/' + phase + f'/gpuSample{index}')
                require(type(gpu.get('disjointObserved')) is bool,
                        where + '/' + phase + ': missing disjoint flag')
                phase_verified = gpu.get('phaseAttributionVerified')
                if phase_verified is not None:
                    require(type(phase_verified) is bool,
                            where + '/' + phase + ': phase attribution must be boolean')
                excluded = gpu.get('excludedCrossPhaseQueries')
                if excluded is not None:
                    require(type(excluded) is int and 0 <= excluded <= 10000,
                            where + '/' + phase + ': invalid excluded cross-phase query count')
                dropped = gpu.get('droppedQueries')
                require(type(dropped) is int and 0 <= dropped <= 10000,
                        where + '/' + phase + ': invalid skipped query count')
                require(mode == 'hardware' or not values,
                        where + '/' + phase + ': software samples cannot claim GPU timing')
                actual_gpu_samples += len(values)
            require(visit['gpuTimerQueryMeasured'] is (any(
                visit[phase].get('gpuTimer', {}).get('samplesMs')
                for phase in ('idle', 'move')
            )), where + ': GPU timer claim does not match actual completed samples')
            number(visit['move'].get('inputToConfirmationMs'), where + '/move/confirmation')
        require(data['browserFramePacingOnly'] is (actual_gpu_samples == 0),
                prefix + 'GPU/frame-pacing declaration inconsistent with real query samples')
        reports[profile].append(data)
    require(len(renderers) == 1, f'{directory}: renderer identity differs between runs: {sorted(renderers)}')
    require(len(variants) == 1, f'{directory}: mixed V3/V4 variants in a single cohort')
    for profile, items in reports.items():
        require(len(items) >= minimum, f'{directory}: {profile} has {len(items)} runs, needs >= {minimum}')
    return reports, next(iter(renderers)), next(iter(variants))


def summarize(reports, visit_type, metric):
    index = VISITS.index(visit_type)
    values = []
    for report in reports:
        visit = report['visits'][index]
        if metric in ('idle', 'move'):
            values.append(visit[metric]['rafP95Ms'])
        elif metric == 'input':
            values.append(visit['move']['inputToConfirmationMs'])
        elif metric == 'shell':
            values.append(visit['openToReadyWallMs'])
        elif metric in ('hans', 'scene'):
            # Legacy records predate delayed-stage measurements. Never
            # backfill a guessed wait or confuse shell ready with scene ready.
            delay = visit.get('hansReadyAfterShellMs')
            if delay is None:
                return None
            values.append(delay if metric == 'hans' else visit['openToReadyWallMs'] + delay)
        elif metric == 'calls':
            values.append(visit['firstReady']['calls'])
        elif metric == 'triangles':
            values.append(visit['firstReady']['triangles'])
        else:
            raise BadReport('unknown metric: ' + metric)
    return statistics.median(values)


def validate_capture_provenance(before, after):
    """Reject known browser/DPR/resolution mismatches; flag incomplete legacy metadata.

    Different profile viewports are expected. Only compare the corresponding
    profile + visit across A/B. Missing old fields remain readable for rAF
    diagnostics, but do not authorize a GPU delta.
    """
    verified = True
    versions = set()
    bootstrap_modes = set()
    for profile in PROFILES:
        reports = before[profile] + after[profile]
        for report in reports:
            bootstrap_modes.add(report.get('bootstrapMode', 'form-login-v1'))
            version = report.get('browserVersion')
            if version is None:
                verified = False
            else:
                versions.add(version)
        for visit_name in VISITS:
            index = VISITS.index(visit_name)
            observed = [report['visits'][index] for report in reports]
            # The room is considered a stable GPU cohort only after the
            # async Hans stage is installed in *every* A/B visit.
            stages = {visit.get('hansStage') for visit in observed}
            if None in stages or len(stages) != 1:
                verified = False
            for field in ('canvasPixels', 'canvasWidth', 'canvasHeight', 'devicePixelRatio'):
                values = {visit[field] for visit in observed if visit.get(field) is not None}
                require(len(values) <= 1,
                        f'{profile}/{visit_name}: different {field} between A/B runs')
                if len(values) == 0 or any(visit.get(field) is None for visit in observed):
                    verified = False
    require(len(versions) <= 1, 'Different Chromium/browser versions between A/B runs')
    require(len(bootstrap_modes) == 1,
            'Cannot compare form-login and persisted-session bootstrap captures in one A/B')
    return verified


def render_phase_median(reports, visit_type, phase, metric):
    """Median of per-run actual Three.js draws, not first-ready or rAF."""
    values = []
    counts = []
    for report in reports:
        sample = report['visits'][VISITS.index(visit_type)][phase].get('renderCost')
        if (not sample or sample.get('status') != 'ready'
                or sample.get('renderedFrames', 0) < 3):
            return None, None
        values.append(sample[metric])
        counts.append(sample['renderedFrames'])
    return statistics.median(values), min(counts)


def gpu_phase_median(reports, visit_type, phase):
    """Return real GPU elapsed median only for a fully comparable cohort."""
    values = []
    for report in reports:
        sample = report['visits'][VISITS.index(visit_type)][phase].get('gpuTimer')
        if (not sample or sample['status'] != 'ready'
                or sample.get('phaseAttributionVerified') is not True
                or sample['disjointObserved'] or sample['droppedQueries']
                or len(sample['samplesMs']) < 2):
            return None
        values.append(statistics.median(sample['samplesMs']))
    return statistics.median(values)


def compare(baseline, candidate, base_sha, candidate_sha, *, mode='hardware', minimum=2):
    require(mode in ('hardware', 'software'), 'Mode must be hardware or software')
    require(minimum >= 2, 'At least two independent runs per revision/profile required')
    before, old_renderer, base_variant = load_group(Path(baseline), base_sha, mode, minimum)
    after, new_renderer, candidate_variant = load_group(Path(candidate), candidate_sha, mode, minimum)
    require(base_variant == candidate_variant, 'Cannot compare V3 and V4 in an A/B performance regression')
    require(old_renderer == new_renderer, 'Different physical renderer/driver strings: no valid A/B')
    provenance_verified = validate_capture_provenance(before, after)
    lines = [
        f'# War Room {base_variant.upper()} · repeated browser pacing + optional measured GPU A/B',
        '',
        f'Baseline {base_sha} → candidate {candidate_sha}',
        f'Renderer: {old_renderer} · requested mode: {mode}',
        ('Chromium version + CSS DPR + physical canvas dimensions: verified A/B'
         if provenance_verified else
         'Legacy/incomplete Chromium or canvas provenance: GPU comparison is n/a'),
        '',
        '**rAF p95 is callback cadence, not GPU time or FPS.** Genuine GPU time '
        'is reported separately only when both cohorts have >=2 completed elapsed '
        'WebGL2 queries per phase/run, verified query-start phase attribution, '
        'and no disjoint or missed queries. '
        'No statistical significance or physical Android claim is made.',
        '',
        '| Profile · visit · metric | Baseline median | Candidate median | Delta | Runs A/B |',
        '|---|---:|---:|---:|---:|',
    ]
    for profile in PROFILES:
        for visit in VISITS:
            for metric, label in (('idle', 'idle rAF p95 (ms)'), ('move', 'move rAF p95 (ms)'),
                                  ('input', 'input→confirmation (ms)'),
                                  ('shell', 'open→shell-ready wall (ms)'),
                                  ('hans', 'shell-ready→Hans-ready wall (ms)'),
                                  ('scene', 'open→Hans-ready wall (ms)'),
                                  ('calls', 'first-ready draw calls'),
                                  ('triangles', 'first-ready triangles')):
                a = summarize(before[profile], visit, metric)
                b = summarize(after[profile], visit, metric)
                if a is None or b is None:
                    lines.append(f'| {profile} · {visit} · {label} | n/a | n/a | n/a | '
                                 f'{len(before[profile])}/{len(after[profile])} |')
                else:
                    lines.append(f'| {profile} · {visit} · {label} | {a:.2f} | {b:.2f} | '
                                 f'{b-a:+.2f} | {len(before[profile])}/{len(after[profile])} |')
    lines.extend([
        '', '## Sustained renderer.render() cost · actual rendered frames only',
        '',
        'These are real Three.js draw submissions, not rAF ticks, total frame CPU, '
        'or GPU elapsed time. CPU submit duration brackets only renderer.render(). '
        'Missing/overflowed/legacy phases are n/a.',
        '',
        '| Profile · visit · phase · metric | Baseline median | Candidate median | Delta | Min rendered frames A/B |',
        '|---|---:|---:|---:|---:|',
    ])
    for profile in PROFILES:
        for visit in VISITS:
            for phase in ('idle', 'move'):
                for metric, label in (
                    ('callsMedian', 'draw calls/frame median'),
                    ('callsP95', 'draw calls/frame p95'),
                    ('trianglesMedian', 'triangles/frame median'),
                    ('cpuSubmitMedianMs', 'renderer CPU submit median (ms)'),
                    ('cpuSubmitP95Ms', 'renderer CPU submit p95 (ms)'),
                ):
                    a, ac = render_phase_median(before[profile], visit, phase, metric)
                    b, bc = render_phase_median(after[profile], visit, phase, metric)
                    key = f'{profile} · {visit} · {phase} · {label}'
                    if a is None or b is None:
                        lines.append(f'| {key} | n/a | n/a | n/a | Missing/incomplete real render journal |')
                    else:
                        lines.append(f'| {key} | {a:.2f} | {b:.2f} | {b-a:+.2f} | {ac}/{bc} |')
    lines.extend([
        '', '## GPU TIME_ELAPSED_EXT (ms): only valid measured queries',
        '',
        '| Profile · visit · phase | Baseline GPU median | Candidate GPU median | Delta | Coverage |',
        '|---|---:|---:|---:|---|',
    ])
    for profile in PROFILES:
        for visit in VISITS:
            for phase in ('idle', 'move'):
                a = gpu_phase_median(before[profile], visit, phase) if mode == 'hardware' and provenance_verified else None
                b = gpu_phase_median(after[profile], visit, phase) if mode == 'hardware' and provenance_verified else None
                label = f'{profile} · {visit} · {phase}'
                if a is None or b is None:
                    lines.append(f'| {label} | n/a | n/a | n/a | Missing/incomparable GPU queries |')
                else:
                    lines.append(f'| {label} | {a:.3f} | {b:.3f} | {b-a:+.3f} | '
                                 f'{len(before[profile])}/{len(after[profile])} independent runs |')
    lines.extend(['', 'Touch profiles are **desktop-browser emulations**, not physical Android devices.',
                  'Repeat A/B/B/A on one machine and confirm differences with real interaction.'])
    if mode == 'software':
        lines.append('**Software renderer:** this report cannot establish hardware performance.')
    return '\n'.join(lines) + '\n'


def fake_report(sha, profile, run_id, renderer='ANGLE (NVIDIA GeForce test)'):
    viewport, touch = PROFILES[profile]
    def visit(name):
        return {
            'visitType': name, 'actual': 'hardware', 'renderer': renderer,
            'canvasWidth': viewport['width'], 'canvasHeight': viewport['height'],
            'canvasPixels': viewport['width'] * viewport['height'],
            'devicePixelRatio': 1,
            'gpuFrameTimeMs': None, 'gpuTimerQueryMeasured': False,
            'firstReady': {'calls': 491, 'triangles': 210000},
            'openToReadyWallMs': 3000,
            'hansStage': 'v3-armory-hall:quick',
            'hansReadyAfterShellMs': 120,
            'idle': {'rafIntervals': 150, 'rafP50Ms': 16.6, 'rafP95Ms': 17,
                     'elapsedMs': 2500, 'rafGapsOver33Ms': 1, 'rafGapsOver50Ms': 0},
            'move': {'rafIntervals': 120, 'rafP50Ms': 16.6, 'rafP95Ms': 19,
                     'elapsedMs': 2000, 'rafGapsOver33Ms': 1, 'rafGapsOver50Ms': 0,
                     'inputToConfirmationMs': 120},
        }
    return {'schema': 2, 'revision': sha, 'requestedRenderer': 'hardware',
            'browserVersion': '147.0.0.0',
            'browserFramePacingOnly': True, 'physicalAndroidVerified': False,
            'runId': run_id, 'profile': profile, 'viewport': viewport, 'emulatedTouch': touch,
            'visits': [visit(name) for name in VISITS]}


def self_test():
    a, b = 'a' * 40, 'b' * 40
    # Median of per-visit scene-ready duration must NOT be reconstructed
    # by summing independent medians of shell and Hans times.
    staggered = [fake_report(a, 'desktop-1440x900',
                             f'00000000-0000-4000-8000-{i:012x}')
                 for i in range(3)]
    for report, (shell, hans) in zip(staggered, [(1000, 100), (1200, 800), (1600, 0)]):
        report['visits'][0]['openToReadyWallMs'] = shell
        report['visits'][0]['hansReadyAfterShellMs'] = hans
    assert summarize(staggered, 'first-visit', 'shell') == 1200
    assert summarize(staggered, 'first-visit', 'hans') == 100
    assert summarize(staggered, 'first-visit', 'scene') == 1600  # not 1200 + 100
    staggered[0]['visits'][0].pop('hansReadyAfterShellMs')
    assert summarize(staggered, 'first-visit', 'scene') is None
    assert summarize(staggered, 'first-visit', 'shell') == 1200

    with tempfile.TemporaryDirectory() as folder:
        base, candidate = Path(folder) / 'base', Path(folder) / 'candidate'
        base.mkdir(); candidate.mkdir()
        for dest, sha in ((base, a), (candidate, b)):
            for profile in PROFILES:
                for index in range(2):
                    report = fake_report(sha, profile, f'00000000-0000-4000-8000-{index:012x}')
                    (dest / f'{profile}-{index}.json').write_text(json.dumps(report))
        output = compare(base, candidate, a, b)
        assert 'first-ready draw calls' in output and 'not GPU time' in output
        assert 'Missing/incomparable GPU queries' in output
        assert '# War Room V3' in output  # Legacy missing variant means V3.
        # Old captures still work as a cohort, but login-form timings must
        # never be compared against the direct persisted-session harness.
        for directory in (base, candidate):
            for path in directory.glob('*.json'):
                report = json.loads(path.read_text())
                report['bootstrapMode'] = 'persisted-e2e-session-v1'
                path.write_text(json.dumps(report))
        assert '# War Room V3' in compare(base, candidate, a, b)
        candidate_path = candidate / 'desktop-1440x900-0.json'
        mixed = json.loads(candidate_path.read_text())
        mixed['bootstrapMode'] = 'form-login-v1'
        candidate_path.write_text(json.dumps(mixed))
        try:
            compare(base, candidate, a, b)
        except BadReport as exc:
            assert 'Cannot compare form-login and persisted-session' in str(exc)
        else:
            raise AssertionError('Mixed login/session A/B bootstrap accepted')
        mixed['bootstrapMode'] = 'persisted-e2e-session-v1'
        candidate_path.write_text(json.dumps(mixed))
        assert '| desktop-1440x900 · first-visit · open→shell-ready wall (ms) | 3000.00 | 3000.00 | +0.00 |' in output
        assert '| desktop-1440x900 · first-visit · shell-ready→Hans-ready wall (ms) | 120.00 | 120.00 | +0.00 |' in output
        assert '| desktop-1440x900 · first-visit · open→Hans-ready wall (ms) | 3120.00 | 3120.00 | +0.00 |' in output

        # V4 is comparable to itself, but never silently compared to V3.
        for directory in (base, candidate):
            for path in directory.glob('*.json'):
                report = json.loads(path.read_text())
                report['variant'] = 'v4'
                for visit in report['visits']:
                    visit['hansStage'] = 'v4-tower-study:quick'
                path.write_text(json.dumps(report))
        assert '# War Room V4' in compare(base, candidate, a, b)
        mismatched = candidate / 'desktop-1440x900-0.json'
        report = json.loads(mismatched.read_text())
        report['variant'] = 'v3'
        for visit in report['visits']:
            visit['hansStage'] = 'v3-armory-hall:quick'
        mismatched.write_text(json.dumps(report))
        try:
            compare(base, candidate, a, b)
        except BadReport as exc:
            assert 'mixed V3/V4' in str(exc)
        else:
            raise AssertionError('Mixed variants were accepted')
        # A and B may be internally consistent but still measure different rooms.
        for path in candidate.glob('*.json'):
            report = json.loads(path.read_text())
            report['variant'] = 'v4'
            for visit in report['visits']:
                visit['hansStage'] = 'v4-tower-study:quick'
            path.write_text(json.dumps(report))
        for path in base.glob('*.json'):
            report = json.loads(path.read_text())
            report['variant'] = 'v3'
            for visit in report['visits']:
                visit['hansStage'] = 'v3-armory-hall:quick'
            path.write_text(json.dumps(report))
        try:
            compare(base, candidate, a, b)
        except BadReport as exc:
            assert 'Cannot compare V3 and V4' in str(exc)
        else:
            raise AssertionError('Cross-revision mixed variants accepted')
        for directory in (base, candidate):
            for path in directory.glob('*.json'):
                report = json.loads(path.read_text())
                report.pop('variant', None)
                for visit in report['visits']:
                    visit['hansStage'] = 'v3-armory-hall:quick'
                path.write_text(json.dumps(report))

        # Schema-2 reports with genuine timer data are still compatible with
        # older rAF-only JSON; no measured GPU is invented for missing data.
        for directory in (base, candidate):
            for path in directory.glob('*.json'):
                recorded = json.loads(path.read_text())
                recorded['browserFramePacingOnly'] = False
                for visit in recorded['visits']:
                    visit['gpuTimerQueryMeasured'] = True
                    for phase in ('idle', 'move'):
                        visit[phase]['gpuTimer'] = {
                            'status': 'ready', 'samplesMs': [3.25, 3.75, 4.25],
                            'disjointObserved': False, 'droppedQueries': 0,
                            'phaseAttributionVerified': True,
                            'excludedCrossPhaseQueries': 0,
                        }
                path.write_text(json.dumps(recorded))
        output = compare(base, candidate, a, b)
        assert '| desktop-1440x900 · first-visit · idle | 3.750 | 3.750 | +0.000 |' in output
        assert 'physical canvas dimensions: verified A/B' in output
        # Old captures are readable for browser pacing, but cannot prove the
        # async Hans graph was already present when GPU timers were sampled.
        stage_path = candidate / 'desktop-1440x900-0.json'
        stage_report = json.loads(stage_path.read_text())
        stage_report['visits'][0].pop('hansStage')
        stage_report['visits'][0].pop('hansReadyAfterShellMs')
        stage_path.write_text(json.dumps(stage_report))
        old_report = compare(base, candidate, a, b)
        assert '| desktop-1440x900 · first-visit · idle | n/a | n/a |' in old_report
        assert '| desktop-1440x900 · first-visit · shell-ready→Hans-ready wall (ms) | n/a | n/a | n/a |' in old_report
        assert '| desktop-1440x900 · first-visit · open→Hans-ready wall (ms) | n/a | n/a | n/a |' in old_report
        assert '| desktop-1440x900 · first-visit · open→shell-ready wall (ms) | 3000.00 |' in old_report
        stage_report['visits'][0]['hansStage'] = 'v3-armory-hall:quick'
        stage_report['visits'][0]['hansReadyAfterShellMs'] = 120
        stage_path.write_text(json.dumps(stage_report))
        # A missing actor is never a faster scene. Reject rather than
        # accepting a falsely cheap GPU sample or a different room.
        stage_report['visits'][0]['hansStage'] = 'missing:door'
        stage_path.write_text(json.dumps(stage_report))
        try:
            compare(base, candidate, a, b)
        except BadReport as exc:
            assert 'incomplete Hans stage' in str(exc)
        else:
            raise AssertionError('Missing Hans incorrectly accepted')
        stage_report['visits'][0]['hansStage'] = 'v3-armory-hall:quick'
        stage_path.write_text(json.dumps(stage_report))
        path = candidate / 'touch-portrait-390x844-1.json'
        report = json.loads(path.read_text())
        report['visits'][0]['idle']['gpuTimer']['phaseAttributionVerified'] = False
        path.write_text(json.dumps(report))
        assert '| touch-portrait-390x844 · first-visit · idle | n/a | n/a |' in compare(base, candidate, a, b)
        # Reports from older local harness versions remain usable for rAF, but
        # must never claim that a delayed query belongs to idle or move.
        report['visits'][0]['idle']['gpuTimer'].pop('phaseAttributionVerified')
        path.write_text(json.dumps(report))
        assert '| touch-portrait-390x844 · first-visit · idle | n/a | n/a |' in compare(base, candidate, a, b)
        report['visits'][0]['idle']['gpuTimer']['phaseAttributionVerified'] = True
        report['visits'][0]['idle']['gpuTimer']['excludedCrossPhaseQueries'] = -1
        path.write_text(json.dumps(report))
        try:
            compare(base, candidate, a, b)
        except BadReport as exc:
            assert 'cross-phase' in str(exc)
        else:
            raise AssertionError('Negative excluded query count accepted')
        report['visits'][0]['idle']['gpuTimer']['excludedCrossPhaseQueries'] = 2
        path.write_text(json.dumps(report))
        assert '| touch-portrait-390x844 · first-visit · idle | 3.750 |' in compare(base, candidate, a, b)
        # A/B must reject different browser builds, real canvas pixel sizes,
        # and device pixel ratios despite identical CSS viewports/renderers.
        for field, replacement in (
            ('browserVersion', '148.0.0.0'),
            ('devicePixelRatio', 2),
            ('canvasWidth', 392),
        ):
            report = json.loads(path.read_text())
            original = report[field] if field == 'browserVersion' else report['visits'][0][field]
            if field == 'browserVersion':
                report[field] = replacement
            else:
                report['visits'][0][field] = replacement
                if field == 'canvasWidth':
                    report['visits'][0]['canvasPixels'] = replacement * report['visits'][0]['canvasHeight']
            path.write_text(json.dumps(report))
            try:
                compare(base, candidate, a, b)
            except BadReport as exc:
                assert 'different' in str(exc).lower() or 'Different' in str(exc)
            else:
                raise AssertionError(f'Mismatched {field} accepted')
            if field == 'browserVersion':
                report[field] = original
            else:
                report['visits'][0][field] = original
                if field == 'canvasWidth':
                    report['visits'][0]['canvasPixels'] = original * report['visits'][0]['canvasHeight']
            path.write_text(json.dumps(report))
        # Old schema-2 files remain rAF readable, but their GPU rows are n/a.
        report = json.loads(path.read_text())
        legacy_version = report.pop('browserVersion')
        path.write_text(json.dumps(report))
        legacy = compare(base, candidate, a, b)
        assert 'Legacy/incomplete Chromium' in legacy
        assert '| touch-portrait-390x844 · first-visit · idle | n/a | n/a |' in legacy
        report['browserVersion'] = legacy_version
        path.write_text(json.dumps(report))
        report = json.loads(path.read_text())
        report['visits'][0]['idle']['gpuTimer']['samplesMs'][1] = -0.5
        path.write_text(json.dumps(report))
        try:
            compare(base, candidate, a, b)
        except BadReport as exc:
            assert 'gpuSample' in str(exc)
        else:
            raise AssertionError('Negative GPU query time accepted')
        report['visits'][0]['idle']['gpuTimer']['samplesMs'][1] = 3.75
        report['visits'][0]['idle']['gpuTimer']['disjointObserved'] = True
        path.write_text(json.dumps(report))
        assert 'Missing/incomparable GPU queries' in compare(base, candidate, a, b)
        report['visits'][0]['idle']['gpuTimer']['disjointObserved'] = False
        path.write_text(json.dumps(report))
        path = candidate / 'touch-portrait-390x844-1.json'
        report = json.loads(path.read_text())
        report['visits'][0]['renderer'] = 'ANGLE (AMD test)'
        path.write_text(json.dumps(report))
        try:
            compare(base, candidate, a, b)
        except BadReport as exc:
            assert 'renderer' in str(exc)
        else:
            raise AssertionError('Mixed renderers accepted')
        path.unlink()
        try:
            compare(base, candidate, a, b)
        except BadReport as exc:
            assert 'needs >= 2' in str(exc)
        else:
            raise AssertionError('Single run accepted')
    print('War Room A/B comparator self-test: OK')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-dir', type=Path)
    parser.add_argument('--candidate-dir', type=Path)
    parser.add_argument('--baseline-sha')
    parser.add_argument('--candidate-sha')
    parser.add_argument('--renderer', choices=('hardware', 'software'), default='hardware')
    parser.add_argument('--min-runs', type=int, default=2)
    parser.add_argument('--output', type=Path, help='Optional Markdown output path')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    try:
        if args.self_test:
            self_test()
            return 0
        require(all((args.baseline_dir, args.candidate_dir, args.baseline_sha, args.candidate_sha)),
                'Provide baseline/candidate dirs and full SHAs')
        output = compare(args.baseline_dir, args.candidate_dir, args.baseline_sha,
                         args.candidate_sha, mode=args.renderer, minimum=args.min_runs)
        if args.output:
            args.output.write_text(output, encoding='utf-8')
        print(output, end='')
        return 0
    except (BadReport, OSError) as exc:
        print('Benchmark comparison rejected: ' + str(exc), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
