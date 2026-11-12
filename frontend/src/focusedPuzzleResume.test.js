import { beforeEach, describe, expect, it } from 'vitest';
import {
  FOCUSED_PUZZLE_RESUME_KEY, clearFocusedPuzzleResume, loadFocusedPuzzleResume, saveFocusedPuzzleResume,
} from './focusedPuzzleResume.js';

const NOW = 1_800_000_000_000;
const params = { puzzleId: 'mate-de-mi-partida', origin: 'postgame-error', filter: { incidentKey: 'human:MISSED_MATE' } };

describe('F5 de un puzzle focalizado', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('chess-study-auth-username', 'alice');
  });
  it('retiene sólo identidad, filtro y origen; no copia FEN ni soluciones', () => {
    const saved = saveFocusedPuzzleResume(params, { now: NOW });
    expect(saved).toMatchObject({ version: 1, owner: 'alice', puzzleId: params.puzzleId, origin: 'postgame-error' });
    expect(JSON.stringify(saved)).not.toMatch(/fen|solution/i);
    expect(loadFocusedPuzzleResume({ now: NOW })).toEqual(saved);
    clearFocusedPuzzleResume();
    expect(loadFocusedPuzzleResume({ now: NOW })).toBeNull();
  });
  it('rechaza identidad ajena, otro origen, un filtro extraño o un token caducado', () => {
    expect(saveFocusedPuzzleResume({ ...params, origin: 'direct' }, { now: NOW })).toBeNull();
    expect(saveFocusedPuzzleResume({ ...params, filter: { arbitrary: 'foo' } }, { now: NOW })).toBeNull();
    saveFocusedPuzzleResume(params, { now: NOW });
    expect(loadFocusedPuzzleResume({ now: NOW + 4 * 60 * 60 * 1000 + 1 })).toBeNull();
    saveFocusedPuzzleResume(params, { now: NOW });
    localStorage.setItem('chess-study-auth-username', 'bob');
    expect(loadFocusedPuzzleResume({ now: NOW })).toBeNull();
    expect(sessionStorage.getItem(FOCUSED_PUZZLE_RESUME_KEY)).toBeNull();
  });
});
