import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { deflateSync } from 'node:zlib';
import {
  HOME_FLAME_PNGS,
  validateHomeFlameEvidence,
} from './verify_home_flame_gpu_evidence.mjs';

// No I/O in tests. Browser evidence is never invented here: construct valid
// in-memory PNGs solely to exercise the offline binary integrity validator.

const pngCrc = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const pngChunk = (name, data) => {
  const type = Buffer.from(name, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(pngCrc(Buffer.concat([type, data])));
  return Buffer.concat([len, type, data, sum]);
};
const makeValidPng = (width, height, seed = 1, filter = 0) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // Non-interlaced RGBA8.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let row = 0; row < height; row += 1) {
    raw[row * (1 + width * 4)] = filter;
    raw[row * (1 + width * 4) + 1] = seed;
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

function example() {
  const images = new Map();
  const visualEvidenceHashes = {};
  const modes = ['normal', 'single', 'single', 'normal'];
  const modelUrlFingerprints = ['1'.repeat(64), 'a'.repeat(64)];
  const visits = modes.map((mode, i) => {
    const file = HOME_FLAME_PNGS[i];
    const png = makeValidPng(320, 180, i + 1);
    images.set(file, png);
    visualEvidenceHashes[file] = {
      sha256: createHash('sha256').update(png).digest('hex'),
      sourceVisit: i + 1, flamePass: mode, canvasWidth: 320, canvasHeight: 180,
    };
    return {
      visit: i + 1, flamePass: mode, actual: 'hardware', fireMotion: 'live',
      vendor: 'intel', rendererFingerprint: 'a1b2c3d4',
      ambient: 'night', lod: 'full', shadows: 'enabled',
      lightProbe: 'pair-normal', wallTorches: 'pair',
      lightsDisabled: 4, lightsAdded: 2,
      matthiasStation: 'reading-chair', matthiasActor: 'ready',
      gpuMedianMs: mode === 'normal' ? 9.5 : 8.9,
      gpuSamplesMs: mode === 'normal'
        ? [9.5, 9.4, 9.6, 9.5] : [8.9, 8.8, 9.0, 8.9],
      completedQueryObservations: 5,
      singlePassMaterials: mode === 'normal' ? 0 : 12,
      liveEligibility: {
        flameNodes: 4, hotNodes: 4, candleNodes: 4,
        materialSlots: 12, doubleSided: 12, frontSided: 0,
        otherSided: 0, transparentNow: 12, transparentDoubleSidedNow: 12,
        singlePassTransparentDoubleSidedNow: mode === 'normal' ? 0 : 12,
      },
      canvasWidth: 320, canvasHeight: 180, modelUrlFingerprints,
    };
  });
  for (const visit of visits) {
    const mainCalls = visit.flamePass === 'normal' ? 310 : 298;
    visit.drawPass = {
      mainCalls, shadowCalls: 0, totalCalls: mainCalls,
      families: {
        main: { castle: mainCalls - 50, matthias: 30, runtime: 20 },
        shadow: { castle: 0, matthias: 0, runtime: 0 },
      },
    };
  }
  const report = {
    schema: 1, status: 'complete', mode: 'hardware', sequence: modes,
    revision: 'a'.repeat(40),
    benchmarkAmbient: 'night', rendererFingerprint: 'a1b2c3d4',
    gpuMedianMs: { normal: 9.5, single: 8.9 },
    gpuDifferenceMs: 9.5 - 8.9,
    mainDrawCalls: { normal: 310, single: 298 },
    drawEvidence: {
      savedMainDrawCalls: 12, reduced: true, gpuMedianImproved: true,
      physicalResultsStable: true, visualReviewRequired: true,
    },
    stability: {
      baseDriftPct: 0, variantDriftPct: 0,
      pairedDifferencesMs: [9.5 - 8.9, 9.5 - 8.9],
      flags: [], repeatRecommended: true,
    },
    gpuContrastPct: 100 * (9.5 - 8.9) / 9.5,
    visualEvidence: [...HOME_FLAME_PNGS], visualEvidenceHashes, visits,
    interpretation: {
      verdict: 'candidate-repeat-and-review-pngs',
      productionApproved: false, visualReviewRequired: true,
      repeatHardwareRunRequired: true,
    },
  };
  return { report, images, read: (filename) => images.get(filename) };
}

describe('offline Home flame A/B/B/A PNG manifest verification', () => {
  it('accepts internally consistent physical-claimed evidence, but never approves production', () => {
    const x = example();
    const result = validateHomeFlameEvidence(x.report, x.read);
    assert.equal(result.checkedScreenshots, 4);
    assert.equal(result.productionApproved, false);
    assert.equal(result.hardwareOriginVerified, false);
    assert.equal(result.visualReviewRequired, true);
    assert.equal(validateHomeFlameEvidence(x.report, x.read, 'a'.repeat(40))
      .checkedScreenshots, 4);
  });

  it('rejects missing, incomplete and legacy two-image evidence', () => {
    for (const patch of [
      { status: 'incomplete' }, { mode: 'software' },
      { visualEvidence: HOME_FLAME_PNGS.slice(0, 2) },
      { sequence: ['normal', 'single', 'normal', 'single'] },
    ]) {
      const x = example();
      assert.throws(() => validateHomeFlameEvidence({ ...x.report, ...patch }, x.read));
    }
  });

  it('rejects stale or ambiguous source revision before reading any PNG', () => {
    const other = example();
    assert.throws(() => validateHomeFlameEvidence(other.report, other.read,
      'b'.repeat(40)), /source revision differs/);
    const missing = example();
    delete missing.report.revision;
    assert.throws(() => validateHomeFlameEvidence(missing.report, missing.read),
      /source revision SHA required/);
    const partial = example();
    partial.report.revision = 'a'.repeat(12);
    assert.throws(() => validateHomeFlameEvidence(partial.report, partial.read),
      /source revision SHA required/);
  });

  it('rejects stale/tampered PNG bytes, absent files and non-PNG data', () => {
    const stale = example();
    stale.images.set(HOME_FLAME_PNGS[2], makeValidPng(320, 180, 99));
    assert.throws(() => validateHomeFlameEvidence(stale.report, stale.read), /bytes differ/);
    const absent = example();
    absent.images.delete(HOME_FLAME_PNGS[3]);
    assert.throws(() => validateHomeFlameEvidence(absent.report, absent.read), /PNG IHDR/);
    const fake = example();
    fake.images.set(HOME_FLAME_PNGS[0], Buffer.alloc(32));
    assert.throws(() => validateHomeFlameEvidence(fake.report, fake.read), /PNG IHDR/);
  });

  it('rejects truncated header-only PNGs even with a matching SHA-256', () => {
    const x = example();
    const file = HOME_FLAME_PNGS[0];
    const fake = x.images.get(file).subarray(0, 33);
    x.images.set(file, fake);
    x.report.visualEvidenceHashes[file].sha256 =
      createHash('sha256').update(fake).digest('hex');
    assert.throws(() => validateHomeFlameEvidence(x.report, x.read),
      /PNG missing IDAT\/IEND|PNG truncated chunk/);
  });

  it('rejects corrupt PNG chunk CRC even if manifest SHA is recomputed', () => {
    const x = example();
    const file = HOME_FLAME_PNGS[2];
    const png = Buffer.from(x.images.get(file));
    png[29] ^= 1; // IHDR CRC byte. Dimensions and canvas remain unchanged.
    x.images.set(file, png);
    x.report.visualEvidenceHashes[file].sha256 =
      createHash('sha256').update(png).digest('hex');
    assert.throws(() => validateHomeFlameEvidence(x.report, x.read), /PNG chunk CRC mismatch/);
  });

  it('rejects decodable-looking PNGs with invalid rows or trailing bytes', () => {
    const badFilter = example();
    const first = HOME_FLAME_PNGS[0];
    const png = makeValidPng(320, 180, 1, 7);
    badFilter.images.set(first, png);
    badFilter.report.visualEvidenceHashes[first].sha256 =
      createHash('sha256').update(png).digest('hex');
    assert.throws(() => validateHomeFlameEvidence(badFilter.report, badFilter.read),
      /PNG invalid row filter/);

    const trailing = example();
    const last = HOME_FLAME_PNGS[3];
    const withGarbage = Buffer.concat([trailing.images.get(last), Buffer.from([99])]);
    trailing.images.set(last, withGarbage);
    trailing.report.visualEvidenceHashes[last].sha256 =
      createHash('sha256').update(withGarbage).digest('hex');
    assert.throws(() => validateHomeFlameEvidence(trailing.report, trailing.read),
      /PNG missing IDAT\/IEND or trailing bytes/);
  });

  it('rejects visit/photo swaps and mismatched canvas dimensions', () => {
    const x = example();
    x.report.visualEvidenceHashes[HOME_FLAME_PNGS[0]].sourceVisit = 4;
    assert.throws(() => validateHomeFlameEvidence(x.report, x.read), /manifest/);
    const y = example();
    y.report.visualEvidenceHashes[HOME_FLAME_PNGS[1]].canvasWidth = 777;
    assert.throws(() => validateHomeFlameEvidence(y.report, y.read), /manifest/);

    // Previously a self-consistent JSON/hash could hide a different image
    // resolution: the verifier never checked the actual PNG IHDR dimensions.
    const z = example();
    const file = HOME_FLAME_PNGS[2];
    const png = z.images.get(file);
    png.writeUInt32BE(321, 16);
    z.report.visualEvidenceHashes[file].sha256 =
      createHash('sha256').update(png).digest('hex');
    assert.throws(() => validateHomeFlameEvidence(z.report, z.read), /PNG dimensions/);

    const short = example();
    const malformed = short.images.get(HOME_FLAME_PNGS[0]);
    malformed.writeUInt32BE(12, 8);
    assert.throws(() => validateHomeFlameEvidence(short.report, short.read), /PNG IHDR/);
  });

  it('requires actual hardware data, live fire, independent timer observations and fixed GLBs', () => {
    for (const alter of [
      (v) => { v.actual = 'software'; },
      (v) => { v.fireMotion = 'paused-offscreen'; },
      (v) => { v.gpuSamplesMs = [1]; },
      (v) => { v.completedQueryObservations = 4; },
      (v) => { v.liveEligibility.transparentDoubleSidedNow = 0; },
      (v) => { v.modelUrlFingerprints = ['b'.repeat(64), 'c'.repeat(64)]; },
      (v) => { v.singlePassMaterials = 0; },
    ]) {
      const x = example();
      alter(x.report.visits[1]);
      assert.throws(() => validateHomeFlameEvidence(x.report, x.read), /visit 2/);
    }
  });

  it('rejects A/B/B/A visits whose real scene identity differs', () => {
    for (const [field, changed] of [
      ['vendor', 'nvidia'],
      ['rendererFingerprint', 'ffffffff'],
      ['ambient', 'dusk'],
      ['lod', 'lite'],
      ['shadows', 'disabled'],
      ['lightProbe', 'pair-disabled'],
      ['wallTorches', 'other'],
      ['lightsDisabled', 0],
      ['lightsAdded', 3],
      ['matthiasStation', 'chess-chair'],
      ['matthiasActor', 'loading'],
      ['fireMotion', 'paused'],
      ['canvasWidth', 321],
      ['canvasHeight', 181],
    ]) {
      const x = example();
      x.report.visits[1][field] = changed;
      // A paused fire is already rejected by the earlier per-visit physical
      // gate, before the cross-visit scene identity check runs.
      const expected = field === 'fireMotion'
        ? /missing physical \/ live alpha \/ query \/ GLB consistency/
        : /changed fixed physical scene identity|PNG manifest/;
      assert.throws(() => validateHomeFlameEvidence(x.report, x.read), expected);
    }
  });

  it('rejects invalid baseline or forged top-level scene identity', () => {
    for (const patch of [
      (x) => { x.report.visits[0].lod = 'lite'; },
      (x) => { x.report.visits[0].vendor = 'unknown'; },
      (x) => { x.report.visits[0].lightsDisabled = 2; },
      (x) => { x.report.benchmarkAmbient = 'dawn'; },
      (x) => { x.report.rendererFingerprint = 'ffffffff'; },
    ]) {
      const x = example();
      patch(x);
      assert.throws(() => validateHomeFlameEvidence(x.report, x.read),
        /invalid fixed physical Home scene identity/);
    }
  });

  it('rejects changes to flame sidedness or transparency outside single-pass flag', () => {
    for (const mutate of [
      (m) => { m.doubleSided = 11; m.frontSided = 1; },
      (m) => { m.transparentNow = 11; m.transparentDoubleSidedNow = 11; },
      (m) => { m.flameNodes = 3; },
      (m) => { m.materialSlots = 11; },
    ]) {
      const x = example();
      mutate(x.report.visits[2].liveEligibility);
      assert.throws(() => validateHomeFlameEvidence(x.report, x.read),
        /changed authored flame material identity/);
    }
  });

  it('rejects forged stable verdicts, drift percentages and pairing claims', () => {
    for (const manipulate of [
      (x) => { x.report.stability.baseDriftPct = 0.1; },
      (x) => { x.report.stability.variantDriftPct = 12; },
      (x) => { x.report.stability.pairedDifferencesMs[1] = 0; },
      (x) => { x.report.stability.flags = ['normal-drift-over-15pct']; },
      (x) => { x.report.stability.repeatRecommended = false; },
      (x) => { x.report.drawEvidence.physicalResultsStable = false; },
      (x) => { delete x.report.stability; },
    ]) {
      const x = example();
      manipulate(x);
      assert.throws(() => validateHomeFlameEvidence(x.report, x.read),
        /stability and paired-drift claims differ/);
    }
  });

  it('rejects contradicted A/B pairs even when their GPU aggregate appears faster', () => {
    const x = example();
    // A(9.5), B(8.9), B(10.0), A(9.5): one paired comparison
    // favors single-pass, the other opposes it. The aggregate is not proof.
    const changed = x.report.visits[2];
    changed.gpuMedianMs = 10.0;
    changed.gpuSamplesMs = [10, 9.9, 10.1, 10];
    x.report.gpuMedianMs.single = (8.9 + 10) / 2;
    x.report.gpuDifferenceMs = 9.5 - x.report.gpuMedianMs.single;
    x.report.gpuContrastPct = 100 * x.report.gpuDifferenceMs / 9.5;
    x.report.drawEvidence.gpuMedianImproved = x.report.gpuDifferenceMs > 0;
    assert.throws(() => validateHomeFlameEvidence(x.report, x.read),
      /stability and paired-drift claims differ/);
  });

  it('accepts correctly recorded unstable physical runs but never approves production', () => {
    const x = example();
    const changed = x.report.visits[2];
    changed.gpuMedianMs = 10.0;
    changed.gpuSamplesMs = [10, 9.9, 10.1, 10];
    const single = (8.9 + 10) / 2;
    x.report.gpuMedianMs.single = single;
    x.report.gpuDifferenceMs = 9.5 - single;
    x.report.gpuContrastPct = 100 * x.report.gpuDifferenceMs / 9.5;
    x.report.drawEvidence.gpuMedianImproved = x.report.gpuDifferenceMs > 0;
    x.report.drawEvidence.physicalResultsStable = false;
    x.report.stability.variantDriftPct = 100 * (10 - 8.9) / single;
    x.report.stability.pairedDifferencesMs = [9.5 - 8.9, 9.5 - 10.0];
    x.report.stability.flags = ['paired-direction-disagrees'];
    const result = validateHomeFlameEvidence(x.report, x.read);
    assert.equal(result.productionApproved, false);
    assert.equal(result.hardwareOriginVerified, false);
  });

  it('rejects reported draw savings not grounded in four visit submissions', () => {
    for (const mutate of [
      (x) => { x.report.mainDrawCalls.normal += 12; },
      (x) => { x.report.mainDrawCalls.single -= 5; },
      (x) => { x.report.drawEvidence.savedMainDrawCalls = 25; },
      (x) => { x.report.drawEvidence.reduced = false; },
      (x) => { x.report.drawEvidence.gpuMedianImproved = false; },
    ]) {
      const x = example();
      mutate(x);
      assert.throws(() => validateHomeFlameEvidence(x.report, x.read),
        /draw saving summary differs/);
    }
  });

  it('rejects missing or inconsistent actual renderer draw passes', () => {
    for (const mutate of [
      (x) => { delete x.report.visits[1].drawPass; },
      (x) => { x.report.visits[1].drawPass.totalCalls -= 1; },
      (x) => { x.report.visits[1].drawPass.families.main.castle -= 1; },
      (x) => { x.report.visits[1].drawPass.families.main.runtime = false; },
    ]) {
      const x = example();
      mutate(x);
      assert.throws(() => validateHomeFlameEvidence(x.report, x.read),
        /invalid measured draw-pass families/);
    }
  });

  it('rejects altered Matthias/runtime/shadow submissions in the candidate', () => {
    const x = example();
    const candidate = x.report.visits[1].drawPass;
    candidate.mainCalls += 1;
    candidate.totalCalls += 1;
    candidate.families.main.matthias += 1;
    assert.throws(() => validateHomeFlameEvidence(x.report, x.read),
      /changed shadow\/Matthias\/runtime draw submissions/);
  });

  it('rejects an optimistic GPU summary inconsistent with raw asynchronous samples', () => {
    const wrongVisit = example();
    wrongVisit.report.visits[0].gpuMedianMs = 8.1;
    assert.throws(() => validateHomeFlameEvidence(wrongVisit.report, wrongVisit.read), /GPU median/);
    const wrongAggregate = example();
    wrongAggregate.report.gpuMedianMs.single = 4;
    assert.throws(() => validateHomeFlameEvidence(wrongAggregate.report, wrongAggregate.read), /GPU summary/);
    const wrongSavings = example();
    wrongSavings.report.gpuDifferenceMs += 2;
    assert.throws(() => validateHomeFlameEvidence(wrongSavings.report, wrongSavings.read), /GPU summary/);
    const wrongPercentage = example();
    wrongPercentage.report.gpuContrastPct = 25;
    assert.throws(() => validateHomeFlameEvidence(wrongPercentage.report, wrongPercentage.read), /GPU summary/);
  });

  it('rejects any purported automatic visual or production approval', () => {
    for (const patch of [
      { productionApproved: true }, { visualReviewRequired: false },
      { repeatHardwareRunRequired: false },
    ]) {
      const x = example();
      Object.assign(x.report.interpretation, patch);
      assert.throws(() => validateHomeFlameEvidence(x.report, x.read), /cannot imply/);
    }
  });
});
