import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_ACTION_META,
  PAWN_SLUG_ENEMY_ACTIONS,
  pawnSlugEnemyActionForState,
  pawnSlugEnemyActionFrame,
  pawnSlugEnemyActionPose,
  pawnSlugEnemySourceFrame,
} from './pawnSlugEnemyActionMotion.js';

describe('Pawn Slug premium soldier action motion', () => {
  it('defines long multi-action tracks for military chess soldiers', () => {
    expect(PAWN_SLUG_ENEMY_ACTION_META.theme).toBe('military-chess-soldiers');
    expect(PAWN_SLUG_ENEMY_ACTION_META.silhouetteByType).toEqual({
      pawn: 'rifle-infantry-pawn',
      knight: 'assault-knight',
      rook: 'heavy-rook-gunner',
    });
    expect(PAWN_SLUG_ENEMY_ACTIONS).toMatchObject({
      idle: { frames: 12 },
      run: { frames: 16 },
      jump: { frames: 10 },
      crouch: { frames: 8 },
      hurt: { frames: 6 },
      climb: { frames: 12 },
    });
  });

  it('prioritizes impact and special traversal poses over locomotion', () => {
    expect(pawnSlugEnemyActionForState({ moving: true, hurt: true, airborne: true })).toBe('hurt');
    expect(pawnSlugEnemyActionForState({ moving: true, climbing: true })).toBe('climb');
    expect(pawnSlugEnemyActionForState({ moving: true, airborne: true })).toBe('jump');
    expect(pawnSlugEnemyActionForState({ moving: true, crouch: true })).toBe('crouch');
    expect(pawnSlugEnemyActionForState({ moving: true })).toBe('run');
    expect(pawnSlugEnemyActionForState()).toBe('idle');
  });

  it('keeps action frames deterministic and maps them into the current authored atlas safely', () => {
    expect(pawnSlugEnemyActionFrame('run', 0)).toBe(0);
    expect(pawnSlugEnemyActionFrame('run', 1)).toBe(15);
    for (const action of Object.keys(PAWN_SLUG_ENEMY_ACTIONS)) {
      const track = PAWN_SLUG_ENEMY_ACTIONS[action];
      for (let frame = 0; frame < track.frames; frame += 1) {
        const source = pawnSlugEnemySourceFrame(action, frame, 8);
        expect(source).toBeGreaterThanOrEqual(0);
        expect(source).toBeLessThan(8);
      }
    }
  });

  it('gives jump, crouch, hurt and climb visibly distinct poses', () => {
    const jumpUp = pawnSlugEnemyActionPose('jump', 2, { vy: 5, type: 'knight' });
    const jumpDown = pawnSlugEnemyActionPose('jump', 7, { vy: -5, type: 'knight' });
    const crouch = pawnSlugEnemyActionPose('crouch', 7, { type: 'pawn' });
    const hurt = pawnSlugEnemyActionPose('hurt', 0, { type: 'pawn' });
    const climb = pawnSlugEnemyActionPose('climb', 3, { type: 'pawn' });
    expect(jumpUp.sy).toBeGreaterThan(1);
    expect(jumpDown.sx).toBeGreaterThan(1);
    expect(crouch.sy).toBeLessThan(0.8);
    expect(Math.abs(hurt.rz)).toBeGreaterThan(0.05);
    expect(climb.y).toBeGreaterThan(0);
  });
});
