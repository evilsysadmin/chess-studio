import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLEAN_GAME_INCIDENT_COVERAGE_VERSION,
  CLEAN_GAME_MIN_ANALYZED_MOVES,
  cleanGameEvidence, competitiveGameSignals,
  cleanGameSummary,
  loadCleanGameRecords,
  recordCleanGameEvidence,
} from './cleanGames.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MISSED_MATE_FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';

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

function factualMove(loss = 12, extras = {}) {
  return move(loss, {
    played: 'e4',
    playedFrom: 'e2',
    playedTo: 'e4',
    suggested: 'e4',
    suggestedFrom: 'e2',
    suggestedTo: 'e4',
    context: { fenBefore: START_FEN },
    ...extras,
  });
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
    expect(clean).toMatchObject({
      sufficientSample: true,
      clean: true,
      mistakes: 0,
      blunders: 0,
      materialGifts: 0,
      missedMates: 0,
      incidentCoverageVersion: CLEAN_GAME_INCIDENT_COVERAGE_VERSION,
      incidentCoveredMoves: 0,
      incidentCoverageSufficient: false,
      incidentKeys: [],
    });

    const missedMateRows = Array.from({ length: 10 }, () => move(18));
    missedMateRows[4] = move(18, { suggested: 'Qh7#', context: { suggested: { checkmate: true }, played: { checkmate: false } } });
    expect(cleanGameEvidence(report(missedMateRows))).toMatchObject({ clean: false, missedMates: 1 });

    const giftRows = Array.from({ length: 10 }, () => move(18));
    giftRows[3] = move(90, { context: { played: { piece: 'q' }, reply: { capturedPlayedPiece: true } } });
    expect(cleanGameEvidence(report(giftRows))).toMatchObject({ clean: false, mistakes: 1, materialGifts: 1 });
  });

  it('guarda cobertura factual e incidentes observados sin confundir muestra global con cobertura reconstruible', () => {
    const coveredRows = Array.from({ length: CLEAN_GAME_MIN_ANALYZED_MOVES }, () => factualMove(10));
    coveredRows[3] = factualMove(500, {
      played: 'Qh3',
      playedFrom: 'h5',
      playedTo: 'h3',
      suggested: 'Qxf7#',
      suggestedFrom: 'h5',
      suggestedTo: 'f7',
      context: { fenBefore: MISSED_MATE_FEN },
    });

    const covered = cleanGameEvidence(report(coveredRows));
    expect(covered).toMatchObject({
      incidentCoverageVersion: CLEAN_GAME_INCIDENT_COVERAGE_VERSION,
      incidentCoveredMoves: CLEAN_GAME_MIN_ANALYZED_MOVES,
      incidentCoverageSufficient: true,
      incidentKeys: ['human:MISSED_MATE'],
    });

    const partialRows = [...coveredRows];
    partialRows[0] = move(10);
    const partial = cleanGameEvidence(report(partialRows));
    expect(partial.sufficientSample).toBe(true);
    expect(partial.incidentCoveredMoves).toBe(CLEAN_GAME_MIN_ANALYZED_MOVES - 1);
    expect(partial.incidentCoverageSufficient).toBe(false);
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


describe('competitiveGameSignals', () => {
  const report = (evaluations, overrides = {}) => ({
    analyzedCount: evaluations.length,
    moveReports: evaluations.map((humanEvaluation) => ({ loss: 10, humanEvaluation })),
    ...overrides,
  });

  it('detects a decisive winning position that escaped without inventing it from material alone', () => {
    const escaped = competitiveGameSignals(report([20, 80, 340, 120, 0]), { outcome: 'draw' });
    expect(escaped.winningPositionEscaped).toBe(true);
    expect(escaped.peakAdvantage).toBe(340);
    expect(escaped.closeGame).toBe(true);
  });

  it('distinguishes stalemate after a winning position for targeted conversion training', () => {
    const signal = competitiveGameSignals(report([10, 320, 500, 0]), { outcome: 'draw', termination: 'stalemate' });
    expect(signal.stalemateFromWinningPosition).toBe(true);
  });

  it('does not manufacture drama from an insufficient or unavailable evaluation sample', () => {
    expect(competitiveGameSignals(report([500, 500]), { outcome: 'loss' }).sufficientSample).toBe(false);
    const noEval = { analyzedCount: 8, moveReports: Array.from({ length: 8 }, () => ({ loss: 10 })) };
    expect(competitiveGameSignals(noEval, { outcome: 'draw' }).winningPositionEscaped).toBe(false);
  });
});
