import { describe, expect, it } from 'vitest';
import { createWarRoomCanvasSizeGate } from './WarRoomCanvasSizeGate.js';

describe('War Room canvas resize gate', () => {
  it('allows the first sizing, ignores identical observers and accepts either changed dimension', () => {
    const shouldResize = createWarRoomCanvasSizeGate();
    expect(shouldResize({ width: 600, height: 400 })).toBe(true);
    expect(shouldResize({ width: 600, height: 400 })).toBe(false);
    expect(shouldResize({ width: 601, height: 400 })).toBe(true);
    expect(shouldResize({ width: 601, height: 401 })).toBe(true);
    expect(shouldResize({ width: 601, height: 401 })).toBe(false);
  });
  it('does not globally share dimensions across different scene mounts', () => {
    const previous = createWarRoomCanvasSizeGate();
    expect(previous({ width: 900, height: 450 })).toBe(true);
    expect(previous({ width: 900, height: 450 })).toBe(false);
    expect(createWarRoomCanvasSizeGate()({ width: 900, height: 450 })).toBe(true);
  });
});
