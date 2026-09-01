import { beforeEach, describe, expect, it } from 'vitest';
import {
  MATTHIAS_3D_OPENING_BANTER_CHANCE,
  MATTHIAS_3D_OPENING_LINES,
  normalizeMatthias3DOpeningBanterState,
  pickMatthias3DOpeningLine,
  resolveMatthias3DOpeningBanter,
} from './matthias3DOpeningBanter.js';

beforeEach(() => {
  sessionStorage.clear();
});

describe('Matthias 3D opening banter', () => {
  it('solo considera una partida 3D en la posicion inicial', () => {
    const state = normalizeMatthias3DOpeningBanterState(null);
    expect(resolveMatthias3DOpeningBanter({ gameId: 'g1', isThreeD: false, historyLength: 0, state }).consumed).toBe(false);
    expect(resolveMatthias3DOpeningBanter({ gameId: 'g1', isThreeD: true, historyLength: 2, state }).consumed).toBe(false);
    expect(resolveMatthias3DOpeningBanter({ gameId: '', isThreeD: true, historyLength: 0, state }).consumed).toBe(false);
  });

  it('usa una probabilidad deliberadamente menor del 50%', () => {
    expect(MATTHIAS_3D_OPENING_BANTER_CHANCE).toBeGreaterThan(0.3);
    expect(MATTHIAS_3D_OPENING_BANTER_CHANCE).toBeLessThan(0.5);

    const silent = resolveMatthias3DOpeningBanter({
      gameId: 'g-silent',
      isThreeD: true,
      historyLength: 0,
      probabilityRoll: 0.95,
      lineRoll: 0,
    });
    expect(silent.line).toBe('');
    expect(silent.consumed).toBe(true);
  });

  it('elige una bravuconada del catalogo cuando toca hablar', () => {
    const result = resolveMatthias3DOpeningBanter({
      gameId: 'g-show',
      isThreeD: true,
      historyLength: 0,
      probabilityRoll: 0.01,
      lineRoll: 0.99,
    });
    expect(MATTHIAS_3D_OPENING_LINES).toContain(result.line);
    expect(result.line).toBe(pickMatthias3DOpeningLine(0.99));
    expect(result.state.lastEligibleStartShowed).toBe(true);
  });

  it('no permite dos apariciones consecutivas y tampoco rerollea el mismo game id', () => {
    const first = resolveMatthias3DOpeningBanter({
      gameId: 'g1',
      isThreeD: true,
      historyLength: 0,
      probabilityRoll: 0,
      lineRoll: 0,
    });
    expect(first.line).toBeTruthy();

    const second = resolveMatthias3DOpeningBanter({
      gameId: 'g2',
      isThreeD: true,
      historyLength: 0,
      probabilityRoll: 0,
      lineRoll: 0,
      state: first.state,
    });
    expect(second.line).toBe('');
    expect(second.reason).toBe('anti-repeat');
    expect(second.state.lastEligibleStartShowed).toBe(false);

    const repeated = resolveMatthias3DOpeningBanter({
      gameId: 'g2',
      isThreeD: true,
      historyLength: 0,
      probabilityRoll: 0,
      lineRoll: 0,
      state: second.state,
    });
    expect(repeated.consumed).toBe(false);
    expect(repeated.reason).toBe('already-seen');
  });
});
