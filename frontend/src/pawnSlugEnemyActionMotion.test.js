import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_ACTION_META,
  PAWN_SLUG_ENEMY_ACTIONS,
  pawnSlugEnemyActionForState,
  pawnSlugEnemyActionFrame,
  pawnSlugEnemyActionPose,
  pawnSlugEnemyDeathDuration,
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
      death: { frames: 14, loop: false, groundedTailFrames: 4 },
    });
  });

  it('prioritizes death, impact and special traversal poses over locomotion', () => {
    expect(pawnSlugEnemyActionForState({ moving: true, hurt: true, airborne: true, dying: true })).toBe('death');
    expect(pawnSlugEnemyActionForState({ moving: true, hurt: true, airborne: true })).toBe('hurt');
    expect(pawnSlugEnemyActionForState({ moving: true, climbing: true })).toBe('climb');
    expect(pawnSlugEnemyActionForState({ moving: true, airborne: true })).toBe('jump');
    expect(pawnSlugEnemyActionForState({ moving: true, crouch: true })).toBe('crouch');
    expect(pawnSlugEnemyActionForState({ moving: true })).toBe('run');
    expect(pawnSlugEnemyActionForState()).toBe('idle');
  });

  it('keeps action frames deterministic and clamps terminal death frames', () => {
    expect(pawnSlugEnemyActionFrame('run', 0)).toBe(0);
    expect(pawnSlugEnemyActionFrame('run', 1)).toBe(15);
    expect(pawnSlugEnemyActionFrame('death', 0)).toBe(0);
    expect(pawnSlugEnemyActionFrame('death', 99)).toBe(13);
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

  it('weights hit reaction by soldier mass without changing logical position', () => {
    const pawn = pawnSlugEnemyActionPose('hurt', 0, { type: 'pawn' });
    const knight = pawnSlugEnemyActionPose('hurt', 0, { type: 'knight' });
    const rook = pawnSlugEnemyActionPose('hurt', 0, { type: 'rook' });
    expect(Math.abs(pawn.x)).toBeGreaterThan(Math.abs(knight.x));
    expect(Math.abs(knight.x)).toBeGreaterThan(Math.abs(rook.x));
    expect(Math.abs(knight.rz)).toBeGreaterThan(Math.abs(pawn.rz));
    expect(rook.sy).toBeLessThan(pawn.sy);
    expect(PAWN_SLUG_ENEMY_ACTION_META.impactStyleByType).toEqual({
      pawn: 'clear-backstep',
      knight: 'armored-twist',
      rook: 'heavy-compression',
    });
  });

  it('keeps the last four death frames grounded for every soldier class', () => {
    expect(pawnSlugEnemyDeathDuration('pawn')).toBeGreaterThan(0.6);
    expect(pawnSlugEnemyDeathDuration('rook')).toBeGreaterThan(pawnSlugEnemyDeathDuration('knight'));
    for (const type of ['pawn', 'knight', 'rook']) {
      for (const frame of [10, 11, 12, 13]) {
        const pose = pawnSlugEnemyActionPose('death', frame, { type });
        expect(pose.grounded).toBe(true);
        expect(pose.y).toBeLessThan(0);
        expect(pose.sy).toBeLessThan(0.6);
      }
    }
  });
});
