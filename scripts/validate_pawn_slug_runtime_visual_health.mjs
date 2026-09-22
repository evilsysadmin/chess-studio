import { readFile } from 'node:fs/promises';

const healthPath = process.argv[2] || '/tmp/pawn-slug-visual/runtime-visual-health.json';
const payload = JSON.parse(await readFile(healthPath, 'utf8'));
const weapons = payload.weaponParityMetrics || {};
const expectedWeapons = ['pistol', 'machinegun', 'shotgun', 'panzerfaust'];
const poses = ['idle', 'run', 'crouch'];
const errors = [];

if (Number(payload.schema || 0) < 8) errors.push('runtime visual health schema < 8');
for (const weapon of expectedWeapons) {
  if (!weapons[weapon]) errors.push(`missing runtime visual metrics for ${weapon}`);
}

function finitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function ratio(value, reference) {
  return Number(value) / Number(reference);
}

function profileOf(metric) {
  return metric?.animation_profile || null;
}

function spreadRatio(profile, medianKey, minKey, maxKey) {
  const median = Number(profile?.[medianKey]);
  const min = Number(profile?.[minKey]);
  const max = Number(profile?.[maxKey]);
  if (!(median > 0) || !(min > 0) || !(max > 0)) return NaN;
  return (max - min) / median;
}

const report = { schema: 2, comparisons: {} };
const pistol = weapons.pistol || {};
for (const pose of poses) {
  const referenceMetric = pistol[pose];
  const reference = profileOf(referenceMetric);
  if (!reference) {
    errors.push(`missing pistol ${pose} animation profile`);
    continue;
  }
  for (const key of [
    'bbox_height_median',
    'core_height_median',
    'core_area_median',
    'body_scale_y',
    'world_core_height_median',
  ]) {
    if (!finitePositive(reference[key])) errors.push(`invalid pistol ${pose} profile ${key}`);
  }

  for (const weapon of expectedWeapons.slice(1)) {
    const currentMetric = weapons[weapon]?.[pose];
    const current = profileOf(currentMetric);
    if (!current) {
      errors.push(`missing ${weapon} ${pose} animation profile`);
      continue;
    }
    const comparisonKey = `${weapon}_vs_pistol_${pose}`;
    const comparison = {
      bboxHeightMedianRatio: ratio(current.bbox_height_median, reference.bbox_height_median),
      coreHeightMedianRatio: ratio(current.core_height_median, reference.core_height_median),
      coreAreaMedianRatio: ratio(current.core_area_median, reference.core_area_median),
      worldCoreHeightMedianRatio: ratio(current.world_core_height_median, reference.world_core_height_median),
      bodyScaleRatio: ratio(current.body_scale_y, reference.body_scale_y),
      candidateCoreHeightSpread: spreadRatio(
        current,
        'core_height_median',
        'core_height_min',
        'core_height_max',
      ),
      referenceCoreHeightSpread: spreadRatio(
        reference,
        'core_height_median',
        'core_height_min',
        'core_height_max',
      ),
      candidateFrames: Number(current.frames || 0),
      referenceFrames: Number(reference.frames || 0),
    };
    report.comparisons[comparisonKey] = comparison;

    if (comparison.bodyScaleRatio < 0.99 || comparison.bodyScaleRatio > 1.01) {
      errors.push(`${comparisonKey} body scale ratio ${comparison.bodyScaleRatio.toFixed(4)} outside 0.99..1.01`);
    }
    if (comparison.coreHeightMedianRatio < 0.95 || comparison.coreHeightMedianRatio > 1.05) {
      errors.push(`${comparisonKey} median core height ratio ${comparison.coreHeightMedianRatio.toFixed(4)} outside 0.95..1.05`);
    }
    if (comparison.worldCoreHeightMedianRatio < 0.95 || comparison.worldCoreHeightMedianRatio > 1.05) {
      errors.push(`${comparisonKey} median world core height ratio ${comparison.worldCoreHeightMedianRatio.toFixed(4)} outside 0.95..1.05`);
    }
    if (comparison.coreAreaMedianRatio < 0.88 || comparison.coreAreaMedianRatio > 1.18) {
      errors.push(`${comparisonKey} median central alpha mass ratio ${comparison.coreAreaMedianRatio.toFixed(4)} outside 0.88..1.18`);
    }

    // Temporal guard: a single giant/tiny frame must not hide behind a good
    // median. Allow natural gait compression, but reject materially more scale
    // swing than the pistol reference plus a small absolute margin.
    const allowedSpread = Math.max(0.10, comparison.referenceCoreHeightSpread + 0.04);
    if (
      Number.isFinite(comparison.candidateCoreHeightSpread)
      && comparison.candidateCoreHeightSpread > allowedSpread
    ) {
      errors.push(
        `${comparisonKey} frame-to-frame core-height spread ${comparison.candidateCoreHeightSpread.toFixed(4)} exceeds ${allowedSpread.toFixed(4)}`,
      );
    }
  }
}

report.ok = errors.length === 0;
report.errors = errors;
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
