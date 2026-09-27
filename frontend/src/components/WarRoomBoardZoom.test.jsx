import { describe, expect, it } from 'vitest';
import { clampWarRoomZoom, nextWarRoomPinchZoom } from './WarRoomBoardZoom.jsx';

describe('WarRoomBoardZoom', () => {
  it('keeps canonical framing as the minimum zoom', () => {
    expect(clampWarRoomZoom(.6)).toBe(1);
    expect(clampWarRoomZoom(1)).toBe(1);
  });

  it('caps close zoom to avoid losing the playable board', () => {
    expect(clampWarRoomZoom(2)).toBe(1.35);
  });

  it('maps fingers moving apart to zoom in and together back toward center', () => {
    expect(nextWarRoomPinchZoom(1, 100, 125)).toBe(1.25);
    expect(nextWarRoomPinchZoom(1.25, 125, 100)).toBe(1);
  });
});
