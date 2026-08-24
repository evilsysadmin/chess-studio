import { describe, expect, it } from 'vitest';
import { startMemoryComment, openingMemoryComment, resultMemoryComment } from './cpuMemory.js';

describe('memoria contextual CPU', () => {
  it('recuerda rachas reales', () => {
    const rivalry = { record: { currentStreak: -4, recentGames: [] } };
    expect(startMemoryComment(rivalry, { difficulty: 50 })).toContain('4 derrotas');
  });

  it('recuerda una apertura repetida', () => {
    const rivalry = { record: { recentGames: [
      { opening: 'Defensa Siciliana', outcome: 'loss' },
      { opening: 'Defensa Siciliana', outcome: 'loss' },
    ] } };
    const history = [{ san: 'e4' }, { san: 'c5' }];
    expect(openingMemoryComment(history, rivalry)).toContain('Defensa Siciliana');
  });

  it('comenta el cierre de una serie', () => {
    const text = resultMemoryComment('win', { record: {} }, { series: { winner: 'human', humanWins: 2, cpuWins: 0 } });
    expect(text).toContain('2-0');
  });

  it('distingue una remontada real al cerrar la serie', () => {
    const series = { winner: 'human', bestOf: 3, winsNeeded: 2, humanWins: 2, cpuWins: 1, draws: 0, games: [{ outcome: 'loss' }, { outcome: 'win' }, { outcome: 'win' }] };
    expect(resultMemoryComment('win', { record: {} }, { series })).toContain('remontando');
  });

  it('recuerda reincidencias tácticas reales sin inventarlas', () => {
    const rivalry = { record: { games: 5, currentStreak: 0, recentGames: [], incidents: { 'human:MISSED_MATE': 3, 'cpu:KNIGHT_FORK': 2 } } };
    const text = startMemoryComment(rivalry, { difficulty: 64 });
    expect(text).toContain('3 mates ignorados');
  });

});

describe('memoria de serie y última partida', () => {
  it('recuerda el marcador real al continuar una serie', () => {
    const text = startMemoryComment({ record: { recentGames: [], currentStreak: 0 } }, {
      difficulty: 64,
      series: { humanWins: 1, cpuWins: 1, draws: 0, winner: null, games: [{ outcome: 'loss' }] },
    });
    expect(text).toContain('tú 1, yo 1');
    expect(text).toContain('anterior');
  });
  it('abre una serie nueva usando sólo el expediente histórico real', () => {
    const text = startMemoryComment({ record: { recentGames: [], currentStreak: 0 } }, {
      difficulty: 64,
      series: { humanWins: 0, cpuWins: 0, draws: 0, winner: null, games: [] },
      seriesHistoryStats: { total: 4, currentStreak: -2 },
      seriesHistory: [{ winner: 'cpu', humanWins: 0, cpuWins: 2 }],
    });
    expect(text).toContain('2 series perdidas');
  });

  it('recuerda la última serie si no hay una racha suficiente', () => {
    const text = startMemoryComment({ record: { recentGames: [], currentStreak: 0 } }, {
      difficulty: 64,
      series: { humanWins: 0, cpuWins: 0, draws: 0, winner: null, games: [] },
      seriesHistoryStats: { total: 1, currentStreak: 1 },
      seriesHistory: [{ winner: 'human', humanWins: 2, cpuWins: 1 }],
    });
    expect(text).toContain('anterior fue tuya 2-1');
  });

});
