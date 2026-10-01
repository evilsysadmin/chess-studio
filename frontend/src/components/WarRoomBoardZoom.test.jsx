import { describe, expect, it, vi } from 'vitest';
import { clampWarRoomPan, clampWarRoomZoom, nextWarRoomPinchZoom, nextWarRoomTwoFingerPan, resetWarRoomView, shouldShowWarRoomCenter } from './WarRoomBoardZoom.jsx';

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

  it('maps two-finger centroid travel to bounded camera pan', () => {
    expect(clampWarRoomPan(4)).toBe(1);
    expect(clampWarRoomPan(-4)).toBe(-1);
    expect(nextWarRoomTwoFingerPan(
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 134, y: 66 },
      { width: 100, height: 100 },
    )).toEqual({ x: 1, y: -1 });
  });

  it('shows Centrar for zoom, pan or inspection, but not canonical play', () => {
    expect(shouldShowWarRoomCenter(1, false)).toBe(false);
    expect(shouldShowWarRoomCenter(1.2, false)).toBe(true);
    expect(shouldShowWarRoomCenter(1, false, { x: .2, y: 0 })).toBe(true);
    expect(shouldShowWarRoomCenter(1, true)).toBe(true);
  });

  it('resets zoom and camera pan, then exits inspection through its existing control', () => {
    const setZoom = vi.fn();
    const setPan = vi.fn();
    const click = vi.fn();
    const dispatchEvent = vi.fn();
    const root = {
      querySelector: vi.fn((selector) => selector.startsWith('canvas') ? { dispatchEvent } : { click }),
    };
    resetWarRoomView(root, setZoom, true, setPan);
    expect(setZoom).toHaveBeenCalledWith(1);
    expect(setPan).toHaveBeenCalledWith({ x: 0, y: 0 });
    expect(dispatchEvent.mock.calls[0][0].type).toBe('warroom-camera-center');
    expect(click).toHaveBeenCalledOnce();
  });
});
