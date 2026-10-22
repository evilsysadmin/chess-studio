import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHomeGpuFlameEligibility } from './home-gpu-flame-eligibility.mjs';

const census = {
  flameNodes: 29, hotNodes: 19, candleNodes: 25,
  materialSlots: 73, doubleSided: 73, frontSided: 0, otherSided: 0,
  transparentNow: 73, transparentDoubleSidedNow: 73,
  singlePassTransparentDoubleSidedNow: 0,
};

describe('Home GPU opt-in live flame eligibility receipts', () => {
  it('retains real integers without treating material slots as draw submissions', () => {
    assert.deepEqual(parseHomeGpuFlameEligibility(JSON.stringify(census)), census);
    assert.deepEqual(parseHomeGpuFlameEligibility(JSON.stringify({
      ...census, singlePassTransparentDoubleSidedNow: 4,
    })), { ...census, singlePassTransparentDoubleSidedNow: 4 });
  });
  it('keeps absent hosted/software live census unknown, never zero', () => {
    for (const raw of [undefined, null, '', 'null', 'undefined', 'oops', '{}']) {
      assert.equal(parseHomeGpuFlameEligibility(raw), null);
    }
  });
  it('rejects inconsistent sidedness, transparency, single pass or negative counts', () => {
    for (const bad of [
      { ...census, materialSlots: 72 },
      { ...census, transparentNow: 74 },
      { ...census, transparentDoubleSidedNow: 74 },
      { ...census, singlePassTransparentDoubleSidedNow: 74 },
      { ...census, doubleSided: -1 },
      { ...census, materialSlots: 73.1 },
      { ...census, frontSided: undefined },
    ]) {
      assert.equal(parseHomeGpuFlameEligibility(JSON.stringify(bad)), null);
    }
  });
});
