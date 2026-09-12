import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_ACTION_META,
  PAWN_SLUG_ENEMY_ACTIONS,
  PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE,
  pawnSlugEnemyActionForState,
  pawnSlugEnemyActionFrame,
  pawnSlugEnemyActionPose,
  pawnSlugEnemyActionTime,
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

  it('runs hurt choreography on a local impact clock instead of mission time', () => {
    const missionTime = 37.04;
    expect(pawnSlugEnemyActionFrame('hurt', missionTime)).toBe(5);

    const localStart = pawnSlugEnemyActionTime('hurt', { time: 37, hurtStartedAt: 37 });
    const localProgress = pawnSlugEnemyActionTime('hurt', { time: missionTime, hurtStartedAt: 37 });
    expect(localStart).toBe(0);
    expect(localProgress).toBeCloseTo(0.04, 6);
    expect(pawnSlugEnemyActionFrame('hurt', localProgress)).toBe(1);
    expect(pawnSlugEnemyActionTime('run', { time: missionTime, hurtStartedAt: 37 })).toBe(missionTime);
    expect(pawnSlugEnemyActionTime('death', { time: missionTime, deathAge: 0.2 })).toBe(0.2);
  });

  it('fits the six-frame hurt choreography inside the 110 ms runtime impact window', () => {
    expect(PAWN_SLUG_ENEMY_ACTIONS.hurt.rate).toBeGreaterThanOrEqual(45);
    expect(pawnSlugEnemyActionFrame('hurt', 0)).toBe(0);
    expect(pawnSlugEnemyActionFrame('hurt', 0.1)).toBeGreaterThanOrEqual(4);
    expect(pawnSlugEnemyActionFrame('hurt', 0.11)).toBe(5);
  });

  it('matches run cadence to the real movement hierarchy by class', () => {
    expect(PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE.knight).toBeGreaterThan(PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE.pawn);
    expect(PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE.pawn).toBeGreaterThan(PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE.rook);
    const at = 0.2;
    expect(pawnSlugEnemyActionFrame('run', at, 'knight')).toBeGreaterThan(pawnSlugEnemyActionFrame('run', at, 'pawn'));
    expect(pawnSlugEnemyActionFrame('run', at, 'pawn')).toBeGreaterThan(pawnSlugEnemyActionFrame('run', at, 'rook'));
    expect(PAWN_SLUG_ENEMY_ACTION_META.runRateByType).toBe(PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE);
  });

  it('does not alter non-run action cadence when a type is provided', () => {
    expect(pawnSlugEnemyActionFrame('hurt', 0.12, 'knight')).toBe(pawnSlugEnemyActionFrame('hurt', 0.12));
    expect(pawnSlugEnemyActionFrame('jump', 0.31, 'rook')).toBe(pawnSlugEnemyActionFrame('jump', 0.31));
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

  it('snaps back, rebounds and settles during one compact hurt window', () => {
    const snap = pawnSlugEnemyActionPose('hurt', 0, { type: 'pawn' });
    const rebound = pawnSlugEnemyActionPose('hurt', 3, { type: 'pawn' });
    const settled = pawnSlugEnemyActionPose('hurt', 5, { type: 'pawn' });

    expect(snap.x).toBeLessThan(0);
    expect(rebound.x).toBeGreaterThan(0);
    expect(Math.abs(rebound.x)).toBeLessThan(Math.abs(snap.x));
    expect(settled.x).toBeCloseTo(0, 6);
    expect(settled.rz).toBeCloseTo(0, 6);
    expect(settled.sx).toBeCloseTo(1, 6);
    expect(settled.sy).toBeCloseTo(1, 6);
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

  it('offers three stable visual death variants without changing grounded cleanup', () => {
    expect(PAWN_SLUG_ENEMY_ACTION_META.deathVariants).toBe(3);
    const base = pawnSlugEnemyActionPose('death', 6, { type: 'pawn', variant: 0 });
    const alternate = pawnSlugEnemyActionPose('death', 6, { type: 'pawn', variant: 1 });
    const heavy = pawnSlugEnemyActionPose('death', 6, { type: 'pawn', variant: 2 });
    expect(base.rz).not.toBe(alternate.rz);
    expect(base.x).not.toBe(heavy.x);
    expect(Math.sign(base.rz)).toBe(-Math.sign(alternate.rz));
    expect(pawnSlugEnemyActionPose('death', 6, { type: 'pawn', variant: 4 })).toEqual(alternate);
  });

  it('keeps the last four death frames grounded for every soldier class and variant', () => {
    expect(pawnSlugEnemyDeathDuration('pawn')).toBeGreaterThan(0.6);
    expect(pawnSlugEnemyDeathDuration('rook')).toBeGreaterThan(pawnSlugEnemyDeathDuration('knight'));
    for (const type of ['pawn', 'knight', 'rook']) {
      for (const variant of [0, 1, 2]) {
        for (const frame of [10, 11, 12, 13]) {
          const pose = pawnSlugEnemyActionPose('death', frame, { type, variant });
          expect(pose.grounded).toBe(true);
          expect(pose.y).toBeLessThan(0);
          expect(pose.sy).toBeLessThan(0.6);
        }
      }
    }
  });
});
