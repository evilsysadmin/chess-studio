import { describe, expect, it, vi } from 'vitest';
import { clampWarRoomZoom, nextWarRoomPinchZoom, resetWarRoomView, shouldShowWarRoomCenter } from './WarRoomBoardZoom.jsx';

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

  it('shows Centrar for zoom or inspection, but not canonical play', () => {
    expect(shouldShowWarRoomCenter(1, false)).toBe(false);
    expect(shouldShowWarRoomCenter(1.2, false)).toBe(true);
    expect(shouldShowWarRoomCenter(1, true)).toBe(true);
  });

  it('resets zoom and exits inspection through its existing control', () => {
    const setZoom = vi.fn();
    const click = vi.fn();
    const root = { querySelector: vi.fn(() => ({ click })) };
    resetWarRoomView(root, setZoom, true);
    expect(setZoom).toHaveBeenCalledWith(1);
    expect(root.querySelector).toHaveBeenCalledWith('.board3d-inspect');
    expect(click).toHaveBeenCalledOnce();
  });
});
