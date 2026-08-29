import { describe, expect, it } from 'vitest';
import { buildPersonalSeasons, currentPersonalSeason, latestCompletedPersonalSeason } from './personalSeasons.js';

function game(i, outcome = i % 3 === 0 ? 'loss' : 'win', opening = i % 2 ? 'Italiana' : 'Francesa') {
  return {
    id: `g-${i}`,
    sourceGameId: `source-${i}`,
    date: `2026-08-${String(1 + Math.floor(i / 2)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
    outcome,
    mode: 'casual',
    opening,
    difficulty: 30 + i,
    moves: Array(20 + i).fill({ san: 'e4' }),
  };
}

describe('temporadas personales', () => {
  it('agrupa la carrera competitiva en bloques de 20 partidas, no por calendario', () => {
    const history = Array.from({ length: 25 }, (_, i) => game(i + 1));
    const seasons = buildPersonalSeasons(history);
    expect(seasons).toHaveLength(2);
    expect(seasons[0]).toMatchObject({ number: 1, games: 20, target: 20, complete: true });
    expect(seasons[1]).toMatchObject({ number: 2, games: 5, target: 20, complete: false });
    expect(currentPersonalSeason(history).number).toBe(2);
    expect(latestCompletedPersonalSeason(history).number).toBe(1);
  });

  it('resume mejor apertura, mejor victoria y peor blunder sólo con evidencia real', () => {
    const history = Array.from({ length: 20 }, (_, i) => game(i + 1, i < 15 ? 'win' : 'loss', i < 10 ? 'Italiana' : 'Francesa'));
    const archive = {
      'g-6': { worst: { loss: 130, played: 'Qh5?' } },
      'g-17': { worst: { loss: 420, played: '??' } },
    };
    const season = buildPersonalSeasons(history, [], archive)[0];
    expect(season.bestOpening).toMatchObject({ opening: 'Italiana', games: 10, scorePct: 100 });
    expect(season.bestWin.difficulty).toBe(45);
    expect(season.worstBlunder).toMatchObject({ gameId: 'g-17', loss: 420 });
  });

  it('calcula delta de rating cuando hay checkpoints temporales suficientes', () => {
    const history = [game(1), game(2), game(3)];
    const ratings = [
      { date: '2026-08-01T00:00:00Z', rating: 400 },
      { date: '2026-08-01T00:59:58Z', rating: 412 },
      { date: '2026-08-02T01:59:58Z', rating: 426 },
      { date: '2026-08-02T02:59:58Z', rating: 419 },
    ];
    expect(buildPersonalSeasons(history, ratings)[0].rating).toMatchObject({ before: 400, after: 419, delta: 19, exactBaseline: true });
  });

  it('ignora entrenamiento némesis para no inflar la temporada competitiva', () => {
    const history = [game(1), { ...game(2), mode: 'nemesis-training' }];
    expect(currentPersonalSeason(history).games).toBe(1);
  });
});
