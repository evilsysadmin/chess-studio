import { beforeEach, describe, expect, it } from 'vitest';
import { hasAnyRecoverableCombatState, hasRecoverableCombatState } from './combatRecoveryProbe.js';

const CAMPAIGN_KEY = 'chess-study-combat-campaign-v1';
const RUN_KEY = 'chess-study-roguelike-run';
const MARKER_KEY = 'chess-study-active-combat-markers-v1';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('lightweight Combat recovery probe', () => {
  it('preserva el contrato inyectable usado por session restore', () => {
    expect(hasRecoverableCombatState('combat', { campaign: {}, run: {}, freeSession: true })).toBe(true);
    expect(hasRecoverableCombatState('combat', { campaign: {}, run: {}, freeSession: false })).toBe(false);
    expect(hasRecoverableCombatState('roguelike', { campaign: { active: true }, run: {}, freeSession: false })).toBe(true);
    expect(hasRecoverableCombatState('roguelike', { campaign: {}, run: { inRun: true }, freeSession: false })).toBe(true);
    expect(hasRecoverableCombatState('menu', { campaign: { active: true }, run: { inRun: true }, freeSession: true })).toBe(false);
  });

  it('detecta campaña y run activos leyendo sólo sus marcadores persistidos', () => {
    localStorage.setItem(CAMPAIGN_KEY, JSON.stringify({ version: 5, active: true, phase: 'briefing' }));
    expect(hasRecoverableCombatState('roguelike')).toBe(true);
    expect(hasAnyRecoverableCombatState()).toBe(true);

    localStorage.removeItem(CAMPAIGN_KEY);
    localStorage.setItem(RUN_KEY, JSON.stringify({ inRun: true, phase: 'battle' }));
    expect(hasRecoverableCombatState('roguelike')).toBe(true);
    expect(hasAnyRecoverableCombatState()).toBe(true);
  });

  it('usa el marker de sesión libre sin cargar ni validar chess.js', () => {
    sessionStorage.setItem(MARKER_KEY, JSON.stringify({ version: 1, sessionIds: ['free'] }));
    expect(hasRecoverableCombatState('combat')).toBe(true);
    expect(hasAnyRecoverableCombatState()).toBe(true);

    sessionStorage.setItem(MARKER_KEY, JSON.stringify({ version: 1, sessionIds: ['campaign:node-2'] }));
    expect(hasRecoverableCombatState('combat')).toBe(false);
  });

  it('trata storage ausente o corrupto como no recuperable', () => {
    localStorage.setItem(CAMPAIGN_KEY, '{rota');
    localStorage.setItem(RUN_KEY, 'null');
    sessionStorage.setItem(MARKER_KEY, '{rota');
    expect(hasRecoverableCombatState('roguelike')).toBe(false);
    expect(hasRecoverableCombatState('combat')).toBe(false);
    expect(hasAnyRecoverableCombatState()).toBe(false);
  });
});
