import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PAWN_SLUG_POWS } from './pawnSlugPows.js';
import {
  pawnSlugApplyPowReward,
  pawnSlugPowRescueSummary,
  pawnSlugSpawnPowsAhead,
  pawnSlugUpdatePowRescues,
} from './pawnSlugPowRuntime.js';

function stateFixture() {
  return {
    credits: 0,
    pows: [],
    rescuedPows: new Set(),
    player: {
      x: 0,
      y: 0,
      grenades: 1,
      weapon: 'pistol',
      ammo: Infinity,
      arsenal: {
        pistol: { unlocked: true, ammo: Infinity },
        machinegun: { unlocked: false, ammo: 0 },
        shotgun: { unlocked: false, ammo: 0 },
        panzerfaust: { unlocked: false, ammo: 0 },
      },
    },
  };
}

describe('Pawn Slug POW runtime', () => {
  it('spawns configured POWs once as the camera reaches them', () => {
    const state = stateFixture();
    const dynamic = new THREE.Group();
    const created = pawnSlugSpawnPowsAhead(state, dynamic, 40);
    expect(created.map((entry) => entry.id)).toEqual(PAWN_SLUG_POWS.filter((pow) => pow.x <= 40).map((pow) => pow.id));
    expect(dynamic.children.length).toBe(created.length);
    expect(pawnSlugSpawnPowsAhead(state, dynamic, 40)).toEqual([]);
  });

  it('rescues by contact exactly once and applies the configured reward', () => {
    const state = stateFixture();
    const dynamic = new THREE.Group();
    const [entry] = pawnSlugSpawnPowsAhead(state, dynamic, 20);
    state.player.x = entry.x;
    state.player.y = entry.y;
    const onRescue = vi.fn();

    const first = pawnSlugUpdatePowRescues(state, 1, { onRescue });
    const creditsAfter = state.credits;
    const ammoAfter = state.player.arsenal.machinegun.ammo;
    const second = pawnSlugUpdatePowRescues(state, 1.1, { onRescue });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(onRescue).toHaveBeenCalledTimes(1);
    expect(state.rescuedPows.has(entry.id)).toBe(true);
    expect(state.credits).toBe(creditsAfter);
    expect(state.player.arsenal.machinegun.ammo).toBe(ammoAfter);
  });

  it('preserves rescued IDs as an anti-farming contract across mission resets', () => {
    const state = stateFixture();
    state.rescuedPows.add(PAWN_SLUG_POWS[0].id);
    const dynamic = new THREE.Group();
    pawnSlugSpawnPowsAhead(state, dynamic, 25);
    expect(state.pows.some((entry) => entry.id === PAWN_SLUG_POWS[0].id)).toBe(false);
  });

  it('applies credits, grenades and ammo without corrupting missing slots', () => {
    const state = stateFixture();
    pawnSlugApplyPowReward(state, { credits: 12, grenades: 2, ammo: { shotgun: 8, missing: 999 } });
    expect(state.credits).toBe(12);
    expect(state.player.grenades).toBe(3);
    expect(state.player.arsenal.shotgun).toMatchObject({ unlocked: true, ammo: 8 });
  });

  it('reports mission rescue completion and bonus from real rescued IDs', () => {
    const state = stateFixture();
    for (const pow of PAWN_SLUG_POWS) state.rescuedPows.add(pow.id);
    expect(pawnSlugPowRescueSummary(state)).toMatchObject({ rescued: PAWN_SLUG_POWS.length, total: PAWN_SLUG_POWS.length, complete: true });
    expect(pawnSlugPowRescueSummary(state).scoreBonus).toBeGreaterThan(0);
  });

  it('ignores unknown rescued IDs when calculating mission completion and bonus', () => {
    const state = stateFixture();
    state.rescuedPows.add(PAWN_SLUG_POWS[0].id);
    state.rescuedPows.add('pow-retired-from-old-build');
    state.rescuedPows.add('corrupt-id');
    state.rescuedPows.add('another-corrupt-id');

    const summary = pawnSlugPowRescueSummary(state);
    expect(summary).toMatchObject({ rescued: 1, total: PAWN_SLUG_POWS.length, complete: false });
    expect(summary.scoreBonus).toBe(350);
  });
});
