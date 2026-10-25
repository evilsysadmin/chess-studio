import { describe, expect, it } from 'vitest';
import { warRoomFirstFrameReady } from './WarRoomSceneReadiness.js';

function scene({ status, pieces, variant = 'v3', fallback = false, size = 512, combatNodes } = {}) {
  const canvas = {
    isConnected: true, width: size, height: size,
    dataset: { warRoomVariantStatus: status, warRoomVariant: variant },
  };
  if (pieces !== undefined) canvas.dataset.board3dPieceBuilt = String(pieces);
  if (combatNodes !== undefined) canvas.dataset.combatOperationsMapNodes = String(combatNodes);
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
  it('does not uncover the Combat Operations placeholder before real cartography is mounted', () => {
    const options = { requireCombatMap: true };
    expect(warRoomFirstFrameReady(scene({ status: 'loading', pieces: 19, variant: 'combat-ops', combatNodes: 19 }), options)).toBe(false);
    expect(warRoomFirstFrameReady(scene({ status: 'ready', pieces: 19, variant: 'combat-ops' }), options)).toBe(false);
    expect(warRoomFirstFrameReady(scene({ status: 'ready', pieces: 19, variant: 'combat-ops', combatNodes: 0 }), options)).toBe(false);
    expect(warRoomFirstFrameReady(scene({ status: 'ready', pieces: 19, variant: 'combat-ops', combatNodes: 19 }), options)).toBe(true);
    expect(warRoomFirstFrameReady(scene({ status: 'ready', pieces: 32, variant: 'v3' }), options)).toBe(false);
    expect(warRoomFirstFrameReady(scene({ status: 'fallback', pieces: 32, variant: 'classic-fallback' }), options)).toBe(true);
    expect(warRoomFirstFrameReady(scene({ fallback: true }), options)).toBe(true);
    expect(warRoomFirstFrameReady(scene({ status: 'ready', pieces: 32, variant: 'v3' }))).toBe(true);
  });

  it('reveals only completed classic, Blender, and fallback scenes', () => {
    expect(warRoomFirstFrameReady(scene({ status: 'idle', pieces: 32, variant: 'classic' }))).toBe(true);
    expect(warRoomFirstFrameReady(scene({ status: 'ready', pieces: 32 }))).toBe(true);
    expect(warRoomFirstFrameReady(scene({ status: 'fallback', pieces: 32, variant: 'classic-fallback' }))).toBe(true);
    expect(warRoomFirstFrameReady(scene({ fallback: true }))).toBe(true);
  });
});
