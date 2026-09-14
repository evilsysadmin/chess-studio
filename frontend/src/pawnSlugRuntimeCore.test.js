import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_CHECKPOINTS,
  PAWN_SLUG_WORLD_SCALE,
  createPawnSlugInitialState,
  pawnSlugKeyAction,
  pawnSlugNearestCheckpoint,
  pawnSlugStableEnemyVariant,
  pawnSlugWorldX,
} from './pawnSlugRuntimeCore.js';

describe('Pawn Slug runtime core', () => {
  it('creates isolated mutable mission state with the canonical pistol loadout', () => {
    const first = createPawnSlugInitialState({ startToast: 'eins' });
    const second = createPawnSlugInitialState({ startToast: 'zwei' });

    expect(first).not.toBe(second);
    expect(first.spawned).not.toBe(second.spawned);
    expect(first.enemies).not.toBe(second.enemies);
    expect(first.player.arsenal).not.toBe(second.player.arsenal);
    expect(first.player.weapon).toBe('pistol');
    expect(first.player.ammo).toBe(Infinity);
    expect(first.toast).toBe('eins');
    expect(second.toast).toBe('zwei');
  });

  it('keeps world conversion and checkpoints deterministic', () => {
    expect(pawnSlugWorldX(40)).toBe(1);
    expect(PAWN_SLUG_WORLD_SCALE).toBe(1 / 40);
    expect(pawnSlugNearestCheckpoint(PAWN_SLUG_CHECKPOINTS[2] + 0.5)).toBe(PAWN_SLUG_CHECKPOINTS[2]);
    expect(pawnSlugNearestCheckpoint(-999)).toBe(PAWN_SLUG_CHECKPOINTS[0]);
  });

  it('keeps stable enemy variants stable without coupling them to runtime state', () => {
    expect(pawnSlugStableEnemyVariant('ambush-7')).toBe(pawnSlugStableEnemyVariant('ambush-7'));
    expect(pawnSlugStableEnemyVariant('ambush-7')).not.toBe(pawnSlugStableEnemyVariant('ambush-8'));
  });

  it('maps keyboard controls without needing a live renderer', () => {
    expect(pawnSlugKeyAction({ key: 'ArrowLeft' })).toBe('left');
    expect(pawnSlugKeyAction({ key: ' ' })).toBe('jump');
    expect(pawnSlugKeyAction({ key: 'z' })).toBe('fire');
    expect(pawnSlugKeyAction({ key: 'x' })).toBe('grenade');
    expect(pawnSlugKeyAction({ key: '2' })).toBe('weapon:machinegun');
    expect(pawnSlugKeyAction({ key: '9' })).toBeNull();
  });
});
