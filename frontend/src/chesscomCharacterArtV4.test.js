import { describe, expect, it } from 'vitest';
import { CHESSCOM_CHARACTER_ART_V4, chesscomCharacterV4Profile } from './chesscomCharacterArtV4.js';

describe('Chesscom character art v4', () => {
  it('declares the custom mesh and procedural PBR contract', () => {
    expect(CHESSCOM_CHARACTER_ART_V4.identity).toBe('character-art-v4');
    expect(CHESSCOM_CHARACTER_ART_V4.renderer).toBe('custom-lowpoly-meshes');
    expect(CHESSCOM_CHARACTER_ART_V4.materials).toBe('procedural-pbr');
  });

  it('keeps Matthias distinct from rifleman, scout and hostile operators', () => {
    const matthias = chesscomCharacterV4Profile('matthias', true);
    const dieter = chesscomCharacterV4Profile('dieter', true);
    const sven = chesscomCharacterV4Profile('sven', true);
    const guard = chesscomCharacterV4Profile('guard-1', false);

    expect(matthias.identity).toBe('matthias-operative-v4');
    expect(matthias.role).toBe('leader');
    expect(dieter.identity).toBe('rifleman-operator-v4');
    expect(sven.identity).toBe('scout-operator-v4');
    expect(sven.compact).toBe(true);
    expect(guard.identity).toBe('hostile-operator-v4');
    expect(guard.friendly).toBe(false);
  });

  it('keeps the authored muzzle endpoint aligned with each weapon silhouette', () => {
    expect(chesscomCharacterV4Profile('matthias', true).muzzleX).toBeGreaterThan(1);
    expect(chesscomCharacterV4Profile('sven', true).muzzleX).toBeLessThan(.9);
    expect(chesscomCharacterV4Profile('dieter', true).muzzleX).toBeCloseTo(.91, 4);
  });
});
