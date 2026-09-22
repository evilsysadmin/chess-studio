import { readFile } from 'node:fs/promises';

const healthPath = process.argv[2] || '/tmp/pawn-slug-visual/runtime-visual-health.json';
const payload = JSON.parse(await readFile(healthPath, 'utf8'));
const weapons = payload.weaponParityMetrics || {};
const expectedWeapons = ['pistol', 'machinegun', 'shotgun', 'panzerfaust'];
const poses = ['idle', 'run', 'crouch'];
const errors = [];

if (Number(payload.schema || 0) < 7) errors.push('runtime visual health schema < 7');
for (const weapon of expectedWeapons) {
  if (!weapons[weapon]) errors.push(`missing runtime visual metrics for ${weapon}`);
}

function finitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function ratio(value, reference) {
  return Number(value) / Number(reference);
}

const report = { schema: 1, comparisons: {} };
const pistol = weapons.pistol || {};
for (const pose of poses) {
  const reference = pistol[pose];
  if (!reference) {
    errors.push(`missing pistol ${pose} reference`);
    continue;
  }
  for (const key of ['bbox_height', 'core_height', 'core_area', 'body_scale_y', 'world_core_height']) {
    if (!finitePositive(reference[key])) errors.push(`invalid pistol ${pose} ${key}`);
  }

  for (const weapon of expectedWeapons.slice(1)) {
    const current = weapons[weapon]?.[pose];
    if (!current) continue;
    const comparisonKey = `${weapon}_vs_pistol_${pose}`;
    const comparison = {
      bboxHeightRatio: ratio(current.bbox_height, reference.bbox_height),
      coreHeightRatio: ratio(current.core_height, reference.core_height),
      coreAreaRatio: ratio(current.core_area, reference.core_area),
      worldCoreHeightRatio: ratio(current.world_core_height, reference.world_core_height),
      bodyScaleRatio: ratio(current.body_scale_y, reference.body_scale_y),
    };
    report.comparisons[comparisonKey] = comparison;

    // Height/scale gates stay tight; the central alpha-mass gate is deliberately
    // wider because arms/weapon can overlap the torso band. It still catches the
    // known SMG regression where the body looked materially smaller despite a
    // matching total bbox and footline.
    if (comparison.bodyScaleRatio < 0.99 || comparison.bodyScaleRatio > 1.01) {
      errors.push(`${comparisonKey} body scale ratio ${comparison.bodyScaleRatio.toFixed(4)} outside 0.99..1.01`);
    }
    if (comparison.coreHeightRatio < 0.95 || comparison.coreHeightRatio > 1.05) {
      errors.push(`${comparisonKey} core height ratio ${comparison.coreHeightRatio.toFixed(4)} outside 0.95..1.05`);
    }
    if (comparison.worldCoreHeightRatio < 0.95 || comparison.worldCoreHeightRatio > 1.05) {
      errors.push(`${comparisonKey} world core height ratio ${comparison.worldCoreHeightRatio.toFixed(4)} outside 0.95..1.05`);
    }
    if (comparison.coreAreaRatio < 0.88 || comparison.coreAreaRatio > 1.18) {
      errors.push(`${comparisonKey} central alpha mass ratio ${comparison.coreAreaRatio.toFixed(4)} outside 0.88..1.18`);
    }
  }
}

report.ok = errors.length === 0;
report.errors = errors;
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
