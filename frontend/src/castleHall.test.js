import { describe, expect, it } from 'vitest';
import { buildCastleHallGallery, castleHallSummary } from './castleHall.js';

function record(id, outcome, difficulty, moves = 50) {
  return {
    id: `record-${id}`,
    sourceGameId: id,
    date: `2026-09-0${id.slice(-1) || 1}T12:00:00.000Z`,
    outcome,
    difficulty,
    humanColor: 'w',
    moves: Array.from({ length: moves }, (_, index) => ({ san: `m${index}` })),
  };
}

function analysis(gameId, values = {}) {
  return {
    gameId,
    analyzedAt: '2026-09-05T12:00:00.000Z',
    date: '2026-09-05T12:00:00.000Z',
    outcome: values.outcome ?? 'loss',
    difficulty: values.difficulty ?? 70,
    accuracy: values.accuracy ?? 70,
    analyzedCount: values.analyzedCount ?? 12,
    worst: values.worst ?? { index: 8, moveNumber: 5, played: 'Qh5??', suggested: 'Nf3', loss: 420 },
    peakPerspectiveEval: values.peakPerspectiveEval ?? 0,
    troughPerspectiveEval: values.troughPerspectiveEval ?? 0,
    pointOfNoReturn: values.pointOfNoReturn ?? null,
  };
}

describe('castle Hall of Fame / Hall of Shame', () => {
  it('solo acredita placas con hechos de alta señal y partida fuente existente', () => {
    const history = [
      record('game-1', 'win', 82, 34),
      record('game-2', 'loss', 74, 58),
      record('game-3', 'draw', 76, 72),
      record('game-4', 'win', 48, 52),
    ];
    const archive = {
      'game-1': analysis('game-1', { outcome: 'win', accuracy: 84, analyzedCount: 18, worst: { index: 6, loss: 10 }, troughPerspectiveEval: -40 }),
      'game-2': analysis('game-2', { outcome: 'loss', peakPerspectiveEval: 610, worst: { index: 12, moveNumber: 7, played: 'Qa4??', suggested: 'Qd2', loss: 760 } }),
      'game-3': analysis('game-3', { outcome: 'draw', troughPerspectiveEval: -520, worst: { index: 10, loss: 120 } }),
      'game-4': analysis('game-4', { outcome: 'win', accuracy: 96, analyzedCount: 18, worst: { index: 6, loss: 12 }, troughPerspectiveEval: -30 }),
      orphan: analysis('missing-game', { outcome: 'loss', peakPerspectiveEval: 900, worst: { index: 4, loss: 999 } }),
    };

    const gallery = buildCastleHallGallery(history, archive);
    expect(gallery.fame.some((entry) => entry.evidence.type === 'hardest-win')).toBe(true);
    expect(gallery.fame.some((entry) => entry.evidence.type === 'best-accuracy')).toBe(true);
    expect(gallery.fame.some((entry) => entry.evidence.type === 'desperate-save')).toBe(true);
    expect(gallery.shame.some((entry) => entry.evidence.type === 'worst-blunder')).toBe(true);
    expect(gallery.shame.some((entry) => entry.evidence.type === 'missed-conversion')).toBe(true);
    expect([...gallery.fame, ...gallery.shame].some((entry) => entry.sourceGameId === 'missing-game')).toBe(false);
  });

  it('no inaugura el museo por partidas rutinarias', () => {
    const history = [record('game-1', 'win', 35, 80)];
    const archive = {
      'game-1': analysis('game-1', { outcome: 'win', accuracy: 78, analyzedCount: 14, worst: { index: 6, loss: 40 }, peakPerspectiveEval: 120, troughPerspectiveEval: -80 }),
    };
    expect(castleHallSummary(buildCastleHallGallery(history, archive))).toEqual({ fame: 0, shame: 0 });
  });

  it('deduplica la misma partida e incidente dentro de cada galería', () => {
    const history = [record('game-1', 'loss', 80, 52)];
    const archive = {
      'game-1': analysis('game-1', { outcome: 'loss', peakPerspectiveEval: 640, worst: { index: 8, moveNumber: 5, played: 'Qh5??', suggested: 'Nf3', loss: 700 }, pointOfNoReturn: { index: 8 } }),
    };
    const gallery = buildCastleHallGallery(history, archive);
    const keys = gallery.shame.map((entry) => `${entry.sourceGameId}:${entry.moveIndex}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('borrar la partida fuente retira sus placas aunque sobreviva el análisis', () => {
    const archive = { 'game-1': analysis('game-1', { outcome: 'loss', peakPerspectiveEval: 800, worst: { index: 8, loss: 900 } }) };
    expect(castleHallSummary(buildCastleHallGallery([], archive))).toEqual({ fame: 0, shame: 0 });
  });
});
