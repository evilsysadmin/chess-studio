import { describe, expect, it } from 'vitest';
import { warRoomFirstFrameReady } from './WarRoomSceneReadiness.js';

function scene({ status, pieces, variant = 'v3', fallback = false, size = 512 } = {}) {
  const canvas = {
    isConnected: true, width: size, height: size,
    dataset: { warRoomVariantStatus: status, warRoomVariant: variant },
  };
  if (pieces !== undefined) canvas.dataset.board3dPieceBuilt = String(pieces);
  return { querySelector: (selector) => selector === '.board3d-fallback' ? (fallback ? {} : null) : canvas };
}

describe('War Room first-frame gate', () => {
  it('never reveals a mounted but empty WebGL canvas', () => {
    expect(warRoomFirstFrameReady(null)).toBe(false);
    expect(warRoomFirstFrameReady(scene({ status: 'loading', pieces: 32 }))).toBe(false);
    expect(warRoomFirstFrameReady(scene({ status: 'ready' }))).toBe(false);
    expect(warRoomFirstFrameReady(scene({ status: 'ready', pieces: 32, size: 0 }))).toBe(false);
    expect(warRoomFirstFrameReady(scene({ status: 'ready', pieces: 32, variant: 'v3-loading' }))).toBe(false);
  });
  it('reveals only completed classic, Blender, and fallback scenes', () => {
    expect(warRoomFirstFrameReady(scene({ status: 'idle', pieces: 32, variant: 'classic' }))).toBe(true);
    expect(warRoomFirstFrameReady(scene({ status: 'ready', pieces: 32 }))).toBe(true);
    expect(warRoomFirstFrameReady(scene({ status: 'fallback', pieces: 32, variant: 'classic-fallback' }))).toBe(true);
    expect(warRoomFirstFrameReady(scene({ fallback: true }))).toBe(true);
  });
});
