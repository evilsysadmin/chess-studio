import { beforeEach, describe, expect, it } from 'vitest';
import {
  FOCUSED_PUZZLE_RESUME_KEY, clearFocusedPuzzleResume, loadFocusedPuzzleResume, rebuildFocusedPuzzleProgress, saveFocusedPuzzleResume,
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
  it('recupera la jugada siguiente de la línea canónica, sin guardar FEN ni soluciones', () => {
    const original = {
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
      solution: ['Qh5', 'Nc6', 'Bc4'],
    };
    const saved = saveFocusedPuzzleResume({ ...params, ply: 2 }, { now: NOW });
    expect(saved.ply).toBe(2);
    expect(JSON.stringify(saved)).not.toMatch(/fen|solution/i);
    const rebuilt = rebuildFocusedPuzzleProgress(original, loadFocusedPuzzleResume({ now: NOW }));
    expect(rebuilt).toMatchObject({ stepIndex: 2 });
    expect(rebuilt.fen).not.toBe(original.fen);
    expect(rebuildFocusedPuzzleProgress(original, { ply: 0 })).toEqual({ fen: original.fen, stepIndex: 0 });
    const legacy = { ...saved };
    delete legacy.ply;
    sessionStorage.setItem(FOCUSED_PUZZLE_RESUME_KEY, JSON.stringify(legacy));
    expect(rebuildFocusedPuzzleProgress(original, loadFocusedPuzzleResume({ now: NOW })))
      .toEqual({ fen: original.fen, stepIndex: 0 });
  });

  it('no acepta checkpoints falsos, incompletos, fuera de la solución o que no se pueden reconstruir', () => {
    const sample = { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', solution: ['Qh5', 'Nc6', 'Bc4'] };
    for (const ply of [-2, 1, 3, 2.5, '2', null, 258]) {
      expect(saveFocusedPuzzleResume({ ...params, ply }, { now: NOW })).toBeNull();
      expect(rebuildFocusedPuzzleProgress(sample, { ply })).toBeNull();
    }
    // The generic descriptor knows only ply parity. Only canonical replay
    // can prove whether this specific puzzle even has that many plies.
    expect(saveFocusedPuzzleResume({ ...params, ply: 4 }, { now: NOW })).not.toBeNull();
    expect(rebuildFocusedPuzzleProgress(sample, { ply: 4 })).toBeNull();
    expect(rebuildFocusedPuzzleProgress({ ...sample, solution: ['Qh5', 'Ra8', 'Bc4'] }, { ply: 2 })).toBeNull();
    expect(rebuildFocusedPuzzleProgress(sample, { ply: 2 })).toMatchObject({ stepIndex: 2 });
    const valid = saveFocusedPuzzleResume({ ...params, ply: 2 }, { now: NOW });
    sessionStorage.setItem(FOCUSED_PUZZLE_RESUME_KEY, JSON.stringify({ ...valid, ply: 5 }));
    expect(loadFocusedPuzzleResume({ now: NOW })).toBeNull();
    expect(sessionStorage.getItem(FOCUSED_PUZZLE_RESUME_KEY)).toBeNull();
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
