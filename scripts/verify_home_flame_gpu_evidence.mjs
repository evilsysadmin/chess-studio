import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local offline consistency check; this is NOT proof of physical GPU origin
// or visual approval. Run only after the actual browser A/B/B/A benchmark.
export const HOME_FLAME_REPORT = 'home-3d-flame-single-pass-hardware.json';
export const HOME_FLAME_PNGS = Object.freeze([
  'home-3d-flame-pass-normal-hardware.png',
  'home-3d-flame-pass-single-hardware.png',
  'home-3d-flame-pass-single-repeat-hardware.png',
  'home-3d-flame-pass-normal-repeat-hardware.png',
]);
const MODES = ['normal', 'single', 'single', 'normal'];
const HEX_256 = /^[0-9a-f]{64}$/;
const HEX_COMMIT = /^[0-9a-f]{40}$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const fail = (reason) => { throw new Error(`Home flame evidence: ${reason}`); };
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const closeEnough = (actual, calculated) => Number.isFinite(actual)
  && Number.isFinite(calculated)
  && Math.abs(actual - calculated) <= 1e-8 * Math.max(1, Math.abs(calculated));

export function validateHomeFlameEvidence(report, readPng, expectedRevision = null) {
  if (!report || report.schema !== 1 || report.status !== 'complete'
      || report.mode !== 'hardware') fail('complete hardware report required');
  // Files captured from a different checkout cannot certify the current PR.
  // SHA ties the report to a source revision, not to an attested GPU/clean tree.
  if (!HEX_COMMIT.test(report.revision)) fail('full source revision SHA required');
  if (expectedRevision !== null
      && (!HEX_COMMIT.test(expectedRevision) || report.revision !== expectedRevision)) {
    fail('report source revision differs from checked-out HEAD');
  }
  if (!Array.isArray(report.sequence)
      || report.sequence.join(',') !== MODES.join(',')
      || !Array.isArray(report.visits) || report.visits.length !== 4) {
    fail('four ordered normal/single/single/normal hardware visits required');
  }
  if (!Array.isArray(report.visualEvidence)
      || report.visualEvidence.join(',') !== HOME_FLAME_PNGS.join(',')) {
    fail('expected four ordered runtime PNG names');
  }
  if (!report.visualEvidenceHashes
      || Object.keys(report.visualEvidenceHashes).sort().join(',')
        !== [...HOME_FLAME_PNGS].sort().join(',')) {
    fail('four screenshot hashes required, no stale or extra entries');
  }
  if (report.interpretation?.productionApproved !== false
      || report.interpretation?.visualReviewRequired !== true
      || report.interpretation?.repeatHardwareRunRequired !== true
      || report.drawEvidence?.visualReviewRequired !== true) {
    fail('measurements cannot imply production or visual approval');
  }
  const models = report.visits[0]?.modelUrlFingerprints;
  if (!Array.isArray(models) || models.length < 2 || !models.every((hash) => HEX_256.test(hash))) {
    fail('two or more SHA-256 GLB resource identities required');
  }
  for (let i = 0; i < MODES.length; i += 1) {
    const visit = report.visits[i];
    if (visit?.visit !== i + 1 || visit.flamePass !== MODES[i]
        || visit.actual !== 'hardware' || visit.fireMotion !== 'live'
        || !Number.isFinite(visit.gpuMedianMs) || visit.gpuMedianMs <= 0
        || !Array.isArray(visit.gpuSamplesMs) || visit.gpuSamplesMs.length < 4
        || !visit.gpuSamplesMs.every((ms) => Number.isFinite(ms) && ms > 0)
        || !Number.isSafeInteger(visit.completedQueryObservations)
        || visit.completedQueryObservations < 5
        || !Array.isArray(visit.modelUrlFingerprints)
        || visit.modelUrlFingerprints.join(',') !== models.join(',')
        || !Number.isFinite(visit.liveEligibility?.transparentDoubleSidedNow)
        || visit.liveEligibility.transparentDoubleSidedNow <= 0
        || !Number.isSafeInteger(visit.singlePassMaterials)
        || (MODES[i] === 'normal' ? visit.singlePassMaterials !== 0
          : visit.singlePassMaterials <= 0)) {
      fail(`visit ${i + 1} missing physical / live alpha / query / GLB consistency evidence`);
    }
    if (!closeEnough(visit.gpuMedianMs, median(visit.gpuSamplesMs))) {
      fail(`visit ${i + 1} GPU median does not match completed query samples`);
    }
    const file = HOME_FLAME_PNGS[i];
    const record = report.visualEvidenceHashes[file];
    if (!record || record.sourceVisit !== i + 1 || record.flamePass !== MODES[i]
        || !HEX_256.test(record.sha256)
        || !Number.isSafeInteger(visit.canvasWidth) || visit.canvasWidth <= 0
        || !Number.isSafeInteger(visit.canvasHeight) || visit.canvasHeight <= 0
        || record.canvasWidth !== visit.canvasWidth
        || record.canvasHeight !== visit.canvasHeight) {
      fail(`visit ${i + 1} PNG manifest doesn't match the hardware canvas`);
    }
    const png = readPng(file);
    // The WebGL drawing buffer is 1:1 with the captured screenshot in this
    // locked-DPR=1 benchmark. Checking only JSON dimensions would accept a
    // mismatched image whose SHA was accidentally paired with the wrong run.
    // Validate the PNG IHDR dimensions against BOTH the manifest and canvas.
    if (!Buffer.isBuffer(png) || png.length < 33
        || !png.subarray(0, 8).equals(PNG_SIGNATURE)
        || png.readUInt32BE(8) !== 13
        || png.toString('ascii', 12, 16) !== 'IHDR') {
      fail(`${file} has no valid PNG IHDR header`);
    }
    const imageWidth = png.readUInt32BE(16);
    const imageHeight = png.readUInt32BE(20);
    if (imageWidth === 0 || imageHeight === 0
        || imageWidth !== visit.canvasWidth || imageHeight !== visit.canvasHeight
        || imageWidth !== record.canvasWidth || imageHeight !== record.canvasHeight) {
      fail(`${file} PNG dimensions do not match the hardware canvas`);
    }
    if (createHash('sha256').update(png).digest('hex') !== record.sha256) {
      fail(`${file} bytes differ from recorded SHA-256`);
    }
  }
  // A reported draw saving must come from the same four WebGL submit counts
  // as the GPU samples. A stale/edited summary must not certify an apparent
  // pass reduction. Allow normal per-mode variation but lock the invariant
  // Matthias/runtime/shadow submissions, as in the Playwright capture.
  const drawPasses = [];
  for (let i = 0; i < MODES.length; i += 1) {
    const pass = report.visits[i].drawPass;
    const validFamilies = (group) => group
      && ['castle', 'matthias', 'runtime'].every((key) =>
        Number.isSafeInteger(group[key]) && group[key] >= 0);
    if (!pass || !Number.isSafeInteger(pass.mainCalls) || pass.mainCalls <= 0
        || !Number.isSafeInteger(pass.shadowCalls) || pass.shadowCalls < 0
        || !Number.isSafeInteger(pass.totalCalls)
        || pass.mainCalls + pass.shadowCalls !== pass.totalCalls
        || !validFamilies(pass.families?.main) || !validFamilies(pass.families?.shadow)
        || pass.families.main.castle <= 0 || pass.families.main.matthias <= 0
        || ['main', 'shadow'].some((phase) =>
          ['castle', 'matthias', 'runtime'].reduce(
            (sum, family) => sum + pass.families[phase][family], 0,
          ) !== pass[phase + 'Calls'])) {
      fail(`visit ${i + 1} invalid measured draw-pass families`);
    }
    drawPasses.push(pass);
  }
  const original = drawPasses[0];
  for (const pass of drawPasses.slice(1)) {
    if (pass.shadowCalls !== original.shadowCalls
        || pass.families.main.matthias !== original.families.main.matthias
        || pass.families.main.runtime !== original.families.main.runtime) {
      fail('flame trial changed shadow/Matthias/runtime draw submissions');
    }
  }
  const normalMain = median([drawPasses[0].mainCalls, drawPasses[3].mainCalls]);
  const singleMain = median([drawPasses[1].mainCalls, drawPasses[2].mainCalls]);
  const savedMain = normalMain - singleMain;
  if (!closeEnough(report.mainDrawCalls?.normal, normalMain)
      || !closeEnough(report.mainDrawCalls?.single, singleMain)
      || !closeEnough(report.drawEvidence?.savedMainDrawCalls, savedMain)
      || report.drawEvidence?.reduced !== (savedMain > 0)
      || report.drawEvidence?.gpuMedianImproved !== (report.gpuDifferenceMs > 0)) {
    fail('four-visit draw saving summary differs from measured WebGL submissions');
  }

  // The browser harness fixes the lighting, Matthias station and framebuffer
  // for all four cold visits. The offline verifier must independently enforce
  // that contract: valid PNG hashes cannot justify mismatched scene states.
  const identityFields = [
    'vendor', 'rendererFingerprint', 'ambient', 'lod', 'shadows',
    'lightProbe', 'wallTorches', 'lightsDisabled', 'lightsAdded',
    'matthiasStation', 'matthiasActor', 'fireMotion',
    'canvasWidth', 'canvasHeight',
  ];
  const firstVisit = report.visits[0];
  if (!['intel', 'nvidia', 'amd'].includes(firstVisit.vendor)
      || typeof firstVisit.rendererFingerprint !== 'string'
      || !/^[0-9a-f]{8}$/.test(firstVisit.rendererFingerprint)
      || !['dawn', 'day', 'dusk', 'night'].includes(firstVisit.ambient)
      || firstVisit.lod !== 'full' || firstVisit.shadows !== 'enabled'
      || firstVisit.lightProbe !== 'pair-normal'
      || firstVisit.wallTorches !== 'pair'
      || firstVisit.lightsDisabled !== 4 || firstVisit.lightsAdded !== 2
      || typeof firstVisit.matthiasStation !== 'string'
      || !firstVisit.matthiasStation.trim()
      || firstVisit.matthiasActor !== 'ready'
      || report.benchmarkAmbient !== firstVisit.ambient
      || report.rendererFingerprint !== firstVisit.rendererFingerprint) {
    fail('baseline has invalid fixed physical Home scene identity');
  }
  for (let i = 1; i < report.visits.length; i += 1) {
    const visit = report.visits[i];
    for (const field of identityFields) {
      if (visit[field] !== firstVisit[field]) {
        fail(`visit ${i + 1} changed fixed physical scene identity: ${field}`);
      }
    }
  }
  const baselineMaterials = firstVisit.liveEligibility;
  const materialKeys = [
    'flameNodes', 'hotNodes', 'candleNodes', 'materialSlots',
    'doubleSided', 'frontSided', 'otherSided', 'transparentNow',
    'transparentDoubleSidedNow',
  ];
  if (!baselineMaterials || materialKeys.some((key) =>
    !Number.isSafeInteger(baselineMaterials[key]) || baselineMaterials[key] < 0)) {
    fail('baseline live flame material census incomplete');
  }
  for (let i = 1; i < report.visits.length; i += 1) {
    const live = report.visits[i].liveEligibility;
    if (!live || materialKeys.some((key) =>
      !Number.isSafeInteger(live[key]) || live[key] !== baselineMaterials[key])) {
      fail(`visit ${i + 1} changed authored flame material identity`);
    }
  }
  // The finished report must reflect the underlying four visits, not an
  // optimistic aggregate pasted over valid per-visit measurements.
  const baseline = median([report.visits[0].gpuMedianMs, report.visits[3].gpuMedianMs]);
  const candidate = median([report.visits[1].gpuMedianMs, report.visits[2].gpuMedianMs]);
  const difference = baseline - candidate;
  if (!closeEnough(report.gpuMedianMs?.normal, baseline)
      || !closeEnough(report.gpuMedianMs?.single, candidate)
      || !closeEnough(report.gpuDifferenceMs, difference)
      || !closeEnough(report.gpuContrastPct, 100 * difference / baseline)) {
    fail('A/B/B/A GPU summary differs from its recorded physical visits');
  }
  return {
    checkedScreenshots: 4,
    verdict: report.interpretation.verdict,
    productionApproved: false,
    hardwareOriginVerified: false,
    visualReviewRequired: true,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const directory = resolve(process.argv[2] || '.artifacts/home-gpu-benchmark');
    const report = JSON.parse(readFileSync(join(directory, HOME_FLAME_REPORT), 'utf8'));
    const currentRevision = execFileSync('git', ['rev-parse', 'HEAD'],
      { encoding: 'utf8' }).trim();
    const result = validateHomeFlameEvidence(report,
      (name) => readFileSync(join(directory, name)), currentRevision);
    console.log(`Home flame A/B/B/A: ${result.checkedScreenshots} PNG SHA-256 matches; verdict=${result.verdict}`);
    console.log('Local consistency only. Physical origin and visual appearance still require human review.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
