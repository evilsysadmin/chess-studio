import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLEAN_GAME_MIN_ANALYZED_MOVES,
  cleanGameEvidence,
  cleanGameSummary,
  loadCleanGameRecords,
  recordCleanGameEvidence,
} from './cleanGames.js';

function move(loss = 12, extras = {}) {
  return {
    loss,
    severity: loss >= 150 ? 'blunder' : loss >= 60 ? 'mistake' : loss >= 20 ? 'inaccuracy' : 'ok',
    played: 'Nf3',
    suggested: 'Nf3',
    context: {},
    ...extras,
  };
}

function report(rows) {
  return {
    analyzedCount: rows.length,
    averageLoss: Math.round(rows.reduce((sum, row) => sum + row.loss, 0) / Math.max(1, rows.length)),
    moveReports: rows,
  };
}

describe('Partida limpia', () => {
  beforeEach(() => localStorage.clear());

  it('exige muestra suficiente aunque todas las pocas jugadas analizadas sean buenas', () => {
    const evidence = cleanGameEvidence(report(Array.from({ length: CLEAN_GAME_MIN_ANALYZED_MOVES - 1 }, () => move())));
    expect(evidence.sufficientSample).toBe(false);
    expect(evidence.clean).toBe(false);
  });

  it('concede el sello sólo sin mistakes, blunders, mate omitido ni regalo severo de pieza', () => {
    const clean = cleanGameEvidence(report(Array.from({ length: 10 }, () => move(18))));
    expect(clean).toMatchObject({ sufficientSample: true, clean: true, mistakes: 0, blunders: 0, materialGifts: 0, missedMates: 0 });

    const missedMateRows = Array.from({ length: 10 }, () => move(18));
    missedMateRows[4] = move(18, { suggested: 'Qh7#', context: { suggested: { checkmate: true }, played: { checkmate: false } } });
    expect(cleanGameEvidence(report(missedMateRows))).toMatchObject({ clean: false, missedMates: 1 });

    const giftRows = Array.from({ length: 10 }, () => move(18));
    giftRows[3] = move(90, { context: { played: { piece: 'q' }, reply: { capturedPlayedPiece: true } } });
    expect(cleanGameEvidence(report(giftRows))).toMatchObject({ clean: false, mistakes: 1, materialGifts: 1 });
  });

  it('persiste sólo evidencia de autopsia y calcula ratio y rachas', () => {
    const good = report(Array.from({ length: 9 }, () => move(10)));
    const badRows = Array.from({ length: 9 }, () => move(10));
    badRows[2] = move(180);
    const bad = report(badRows);

    recordCleanGameEvidence('g1', good, { date: '2026-08-01T10:00:00Z' });
    recordCleanGameEvidence('g2', good, { date: '2026-08-02T10:00:00Z' });
    recordCleanGameEvidence('g3', bad, { date: '2026-08-03T10:00:00Z' });
    recordCleanGameEvidence('g4', good, { date: '2026-08-04T10:00:00Z' });

    expect(Object.keys(loadCleanGameRecords())).toHaveLength(4);
    expect(cleanGameSummary()).toMatchObject({ eligible: 4, clean: 3, rate: 75, currentStreak: 1, bestStreak: 2 });
  });
});
