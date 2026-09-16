import { describe, expect, it } from 'vitest';
import {
  chroniclesEnemyEffectiveVisualScale,
  chroniclesEnemyRenderRoster,
} from './chroniclesEnemyRenderRoster.js';

describe('Chronicles enemy render roster', () => {
  it('preserves the default dungeon gameplay definitions while exposing render metadata', () => {
    const roster = chroniclesEnemyRenderRoster({ mapId: 'crypt-eight-squares' });
    expect(roster.map(({ id }) => id)).toEqual([
      'corrupted-pawn',
      'gate-jailer',
      'spectral-bishop',
      'scavenger-knight',
    ]);
    expect(roster[0]).toMatchObject({
      id: 'corrupted-pawn',
      visualType: 'corrupted-pawn',
      visualScale: 1,
      visualMotion: 'grounded',
      definition: expect.objectContaining({ hpKey: 'enemyHp' }),
    });
  });

  it('exposes the fantasy Menagerie roster without requiring chess-piece ids', () => {
    const roster = chroniclesEnemyRenderRoster({ mapId: 'menagerie-of-ash' });
    expect(roster.map(({ id, visualType, visualScale, visualMotion }) => ({
      id,
      visualType,
      visualScale,
      visualMotion,
    }))).toEqual([
      { id: 'ash-goblin', visualType: 'ash-goblin', visualScale: 0.9, visualMotion: 'grounded' },
      { id: 'crypt-spider', visualType: 'crypt-spider', visualScale: 0.82, visualMotion: 'skitter' },
      { id: 'ember-wisp', visualType: 'ember-wisp', visualScale: 0.78, visualMotion: 'hover' },
      { id: 'bone-hound', visualType: 'bone-hound', visualScale: 0.92, visualMotion: 'grounded' },
    ]);
  });

  it('treats map visualScale as a multiplier over the registered model scale', () => {
    expect(chroniclesEnemyEffectiveVisualScale(0.92, 1)).toBeCloseTo(0.92);
    expect(chroniclesEnemyEffectiveVisualScale(1, 0.82)).toBeCloseTo(0.82);
    expect(chroniclesEnemyEffectiveVisualScale(0.96, 0.9)).toBeCloseTo(0.864);
    expect(chroniclesEnemyEffectiveVisualScale(Number.NaN, 0)).toBe(1);
  });
});
