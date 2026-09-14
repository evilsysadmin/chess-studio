import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_STURM_BISHOP_META } from './pawnSlugMidBoss.js';
import { createPawnSlugInitialState } from './pawnSlugRuntimeCore.js';
import { pawnSlugRuntimeHud } from './pawnSlugRuntimeHud.js';

describe('Pawn Slug runtime HUD projection', () => {
  it('projects mission state without mutating the runtime core', () => {
    const state = createPawnSlugInitialState({ startToast: 'bereit' });
    state.phase = 'playing';
    state.time = 12.8;
    state.missionTime = 9.7;
    state.toastUntil = 15;
    state.score = 1234.9;
    state.credits = 88.7;
    state.player.hp = 73.2;
    state.player.x = 2200 / 40;
    state.enemies.push(
      { type: 'bishop', dead: false, hp: 47.2, maxHp: 90 },
      { type: 'boss', dead: false, hp: 199.1, maxHp: 300 },
    );

    const hud = pawnSlugRuntimeHud(state);

    expect(hud.phase).toBe('playing');
    expect(hud.hp).toBe(74);
    expect(hud.score).toBe(1234);
    expect(hud.credits).toBe(88);
    expect(hud.missionTime).toBe(9);
    expect(hud.toast).toBe('bereit');
    expect(hud.midBossHp).toBe(48);
    expect(hud.midBossMaxHp).toBe(90);
    expect(hud.midBossLabel).toBe(PAWN_SLUG_STURM_BISHOP_META.label);
    expect(hud.bossHp).toBe(200);
    expect(hud.bossMaxHp).toBe(300);
    expect(hud.weapons).toHaveLength(4);
    expect(hud.weapons.find((weapon) => weapon.id === 'pistol')).toMatchObject({
      current: true,
      unlocked: true,
      ammo: null,
    });
    expect(state.player.hp).toBe(73.2);
  });

  it('hides expired transient toasts while terminal phases keep their message', () => {
    const state = createPawnSlugInitialState({ startToast: 'eins' });
    state.phase = 'playing';
    state.time = 5;
    state.toastUntil = 4;
    expect(pawnSlugRuntimeHud(state).toast).toBe('');

    state.phase = 'gameover';
    expect(pawnSlugRuntimeHud(state).toast).toBe('eins');
  });
});
