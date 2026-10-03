import { describe, expect, it } from 'vitest';
import {
  CANONICAL_VIEW,
  WAR_ROOM_MAX_ZOOM,
  clampWarRoomView,
  clampWarRoomZoom,
  isCanonicalWarRoomView,
  nextWarRoomPinchView,
} from './WarRoomBoardZoom.jsx';

const size = { width: 400, height: 800 };

describe('WarRoomBoardZoom', () => {
  it('keeps canonical framing as the minimum and caps the close zoom', () => {
    expect(clampWarRoomZoom(.6)).toBe(1);
    expect(clampWarRoomZoom(9)).toBe(WAR_ROOM_MAX_ZOOM);
  });

  it('zooms toward the fingers: the point under the pinch stays under it', () => {
    const start = { distance: 100, centroid: { x: 300, y: 200 }, view: CANONICAL_VIEW };
    const view = nextWarRoomPinchView(start, { distance: 200, centroid: { x: 300, y: 200 } }, size);
    expect(view.zoom).toBe(2);
    // Scene point (300,200) maps to 300 + x = 2*300 + x  => x = -300.
    expect(view).toEqual({ zoom: 2, x: -300, y: -200 });
  });

  it('pans with two fingers while zoomed', () => {
    const start = { distance: 100, centroid: { x: 200, y: 400 }, view: { zoom: 2, x: -200, y: -400 } };
    const view = nextWarRoomPinchView(start, { distance: 100, centroid: { x: 260, y: 380 } }, size);
    expect(view).toEqual({ zoom: 2, x: -140, y: -420 });
  });

  it('never exposes empty bands past the scene edges', () => {
    expect(clampWarRoomView({ zoom: 2, x: 50, y: -2000 }, 400, 800)).toEqual({ zoom: 2, x: 0, y: -800 });
    expect(clampWarRoomView({ zoom: 1, x: -30, y: 20 }, 400, 800)).toEqual({ zoom: 1, x: 0, y: 0 });
  });

  it('treats a near-1 zoom as the canonical view (no restore button)', () => {
    expect(isCanonicalWarRoomView({ zoom: 1.005 })).toBe(true);
    expect(isCanonicalWarRoomView({ zoom: 1.2 })).toBe(false);
  });
});
