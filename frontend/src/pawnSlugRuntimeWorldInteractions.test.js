import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disposePawnSlugObject: vi.fn(),
  pawnSlugAnimateDestructibles: vi.fn(),
  pawnSlugApplyDestructibleReward: vi.fn(),
  pawnSlugDamageRuntimeDestructible: vi.fn(),
  pawnSlugRectsOverlap: vi.fn(),
  pawnSlugRetireDestroyedDestructibles: vi.fn(),
  pawnSlugUpdatePowRescues: vi.fn(),
}));

vi.mock('./pawnSlugArt.js', () => ({ disposePawnSlugObject: mocks.disposePawnSlugObject }));
vi.mock('./pawnSlugRuntimeHotPath.js', () => ({
  pawnSlugAnimateDestructibles: mocks.pawnSlugAnimateDestructibles,
  pawnSlugApplyDestructibleReward: mocks.pawnSlugApplyDestructibleReward,
  pawnSlugDamageRuntimeDestructible: mocks.pawnSlugDamageRuntimeDestructible,
  pawnSlugRectsOverlap: mocks.pawnSlugRectsOverlap,
  pawnSlugRetireDestroyedDestructibles: mocks.pawnSlugRetireDestroyedDestructibles,
  pawnSlugUpdatePowRescues: mocks.pawnSlugUpdatePowRescues,
}));

import { createPawnSlugWorldInteractionSystem } from './pawnSlugRuntimeWorldInteractions.js';

function model() {
  return {
    position: { y: 0 },
    rotation: { y: 0 },
  };
}

function runtime() {
  return {
    reducedMotion: false,
    dynamic: { remove: vi.fn() },
    setToast: vi.fn(),
    emitHud: vi.fn(),
    sfx: { play: vi.fn() },
    weapons: { grantWeapon: vi.fn() },
    state: {
      time: 4,
      score: 0,
      shake: 0,
      takenPickups: new Set(),
      pickups: [],
      destructibles: [],
      destroyedDestructibles: new Set(),
      player: {
        x: 2,
        y: 0,
        hp: 50,
        maxHp: 100,
        grenades: 1,
      },
    },
  };
}

describe('Pawn Slug world interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pawnSlugRectsOverlap.mockReturnValue(false);
  });

  it('consumes a collected pickup once and applies its runtime reward', () => {
    const ctx = runtime();
    const pickupModel = model();
    ctx.state.pickups.push({ id: 7, type: 'grenade', x: 2, y: 0, w: 0.9, h: 0.9, bob: 0, model: pickupModel });
    mocks.pawnSlugRectsOverlap.mockReturnValue(true);
    const system = createPawnSlugWorldInteractionSystem(ctx);

    system.updatePickups(0.1);

    expect(ctx.state.player.grenades).toBe(4);
    expect(ctx.state.score).toBe(150);
    expect(ctx.state.takenPickups.has(7)).toBe(true);
    expect(ctx.state.pickups).toHaveLength(0);
    expect(ctx.dynamic.remove).toHaveBeenCalledWith(pickupModel);
    expect(mocks.disposePawnSlugObject).toHaveBeenCalledWith(pickupModel);
    expect(ctx.sfx.play).toHaveBeenCalledWith('pickup');
    expect(ctx.emitHud).toHaveBeenCalledWith(true);
  });

  it('routes an exploding destructible through combat while preserving its reward bookkeeping', () => {
    const ctx = runtime();
    const item = { id: 'barrel-1', type: 'barrel', secret: true, x: 6, y: 1, h: 2 };
    const result = {
      destroyedNow: true,
      score: 225,
      reward: { credits: 12, grenades: 1, ammo: { machinegun: 5 } },
      explosion: { radius: 2.8, damage: 70 },
    };
    mocks.pawnSlugDamageRuntimeDestructible.mockReturnValue(result);
    const explode = vi.fn();
    const burst = vi.fn();
    const system = createPawnSlugWorldInteractionSystem(ctx, { explode, burst });

    expect(system.damageDestructible(item, 80)).toBe(result);

    expect(ctx.state.score).toBe(225);
    expect(mocks.pawnSlugApplyDestructibleReward).toHaveBeenCalledWith(result.reward, ctx.state);
    expect(explode).toHaveBeenCalledWith(6, 2, 2.8, 70);
    expect(burst).not.toHaveBeenCalled();
    expect(ctx.setToast).toHaveBeenCalledWith(expect.stringContaining('CACHE SECRETA'), 1.85);
    expect(ctx.emitHud).toHaveBeenCalledWith(true);
  });

  it('applies POW rescue score/reward feedback and disposes the rescued visual', () => {
    const ctx = runtime();
    const rescuedModel = model();
    mocks.pawnSlugUpdatePowRescues.mockImplementation((_state, _time, options) => {
      options.onRescue({ reward: { credits: 20, grenades: 2, ammo: {} } });
      options.onRemove(rescuedModel);
    });
    const system = createPawnSlugWorldInteractionSystem(ctx);

    system.updatePows();

    expect(ctx.state.score).toBe(350);
    expect(ctx.setToast).toHaveBeenCalledWith(expect.stringContaining('POW RESCUED'), 2.2);
    expect(ctx.sfx.play).toHaveBeenCalledWith('pickup');
    expect(ctx.dynamic.remove).toHaveBeenCalledWith(rescuedModel);
    expect(mocks.disposePawnSlugObject).toHaveBeenCalledWith(rescuedModel);
    expect(ctx.emitHud).toHaveBeenCalledWith(true);
  });
});
