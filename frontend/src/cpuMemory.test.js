import { describe, expect, it } from 'vitest';
import { startMemoryComment, openingMemoryComment, resultMemoryComment, noteworthyMemoryFacts, noteworthyMemorySuffix } from './cpuMemory.js';

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


describe('memoria contextual durante una jugada noteworthy', () => {
  const rivalry = {
    record: {
      games: 12, wins: 3, draws: 2, losses: 7, currentStreak: -2,
      incidents: { 'human:MISSED_MATE': 2 },
      recentGames: [
        { outcome: 'loss', difficulty: 64, opening: 'Defensa Siciliana', moves: 42 },
        { outcome: 'loss', difficulty: 64, opening: 'Defensa Siciliana', moves: 50 },
        { outcome: 'win', difficulty: 64, opening: 'Defensa Siciliana', moves: 38 },
        { outcome: 'loss', difficulty: 64, opening: 'Defensa Siciliana', moves: 44 },
        { outcome: 'loss', difficulty: 64, opening: 'Defensa Francesa', moves: 60 },
      ],
      byOpening: {
        'Defensa Siciliana': { games: 6, wins: 1, draws: 1, losses: 4 },
      },
    },
  };

  it('construye un expediente compacto usando sólo datos persistidos reales', () => {
    const memory = noteworthyMemoryFacts(rivalry, { type: 'MISSED_MATE', priority: 95 }, 'human', {
      occurrenceNumber: 3, opening: 'Defensa Siciliana', difficulty: 64, rematch: true,
    });
    expect(memory.incident).toEqual({ key: 'human:MISSED_MATE', occurrenceNumber: 3, previousOccurrences: 2 });
    expect(memory.rivalry).toEqual({ games: 12, wins: 3, draws: 2, losses: 7 });
    expect(memory.streak).toEqual({ owner: 'cpu', games: 2 });
    expect(memory.currentOpening).toEqual({ name: 'Defensa Siciliana', games: 6, wins: 1, draws: 1, losses: 4 });
    expect(memory.currentDifficultyRecent).toEqual({ level: 64, games: 5, wins: 1, draws: 0, losses: 4 });
    expect(memory.lastGame.opening).toBe('Defensa Siciliana');
  });

  it('no inventa historial de apertura o dificultad con muestra insuficiente', () => {
    const memory = noteworthyMemoryFacts({ record: { games: 2, incidents: {}, recentGames: [], byOpening: {} } }, { type: 'MATE_FOUND', priority: 100 }, 'human', {
      occurrenceNumber: 1, opening: 'Apertura Inglesa', difficulty: 50,
    });
    expect(memory.currentOpening).toBeUndefined();
    expect(memory.currentDifficultyRecent).toBeUndefined();
    expect(memory.rivalry).toBeUndefined();
    expect(memory.incident.previousOccurrences).toBe(0);
  });

  it('no aumenta el parloteo: el suffix contextual sólo aparece en eventos graves con muestra fuerte', () => {
    const strong = noteworthyMemoryFacts(rivalry, { type: 'ALLOWED_MATE', priority: 88 }, 'human', {
      occurrenceNumber: 1, opening: 'Defensa Siciliana', difficulty: 64,
    });
    expect(noteworthyMemorySuffix(strong, { type: 'ALLOWED_MATE', priority: 88 }, 'human')).toContain('Defensa Siciliana');
    expect(noteworthyMemorySuffix(strong, { type: 'KNIGHT_FORK', priority: 70 }, 'human')).toBe('');
  });

  it('una reincidencia usa el suffix específico existente y no duplica otra coletilla histórica', () => {
    const memory = noteworthyMemoryFacts(rivalry, { type: 'MISSED_MATE', priority: 95 }, 'human', {
      occurrenceNumber: 3, opening: 'Defensa Siciliana', difficulty: 64,
    });
    expect(noteworthyMemorySuffix(memory, { type: 'MISSED_MATE', priority: 95 }, 'human')).toBe('');
  });
});

describe('memoria CPU v2 entre partidas', () => {
  it('usa el balance histórico completo de una apertura, no sólo las últimas partidas', () => {
    const rivalry = { record: { byOpening: { 'Defensa Siciliana': { games: 9, wins: 2, draws: 1, losses: 6 } }, recentGames: [] } };
    const history = [{ san: 'e4' }, { san: 'c5' }];
    const text = openingMemoryComment(history, rivalry);
    expect(text).toContain('2-6');
    expect(text).toContain('9');
  });

  it('recuerda un hito de rivalidad al cerrar una partida sin hablar en cada final', () => {
    const rivalry = { record: { games: 25, wins: 8, draws: 3, losses: 14, currentStreak: 0, recentGames: [], byOpening: {} } };
    expect(resultMemoryComment('win', rivalry, { difficulty: 64 })).toContain('25 partidas');
  });

  it('puede referirse a una apertura dominada sólo con muestra fuerte y en umbral espaciado', () => {
    const rivalry = { record: { games: 17, wins: 4, draws: 1, losses: 12, currentStreak: 0, recentGames: [], byOpening: { 'Defensa Siciliana': { games: 9, wins: 1, draws: 1, losses: 7 } } } };
    expect(resultMemoryComment('loss', rivalry, { opening: 'Defensa Siciliana', difficulty: 64 })).toContain('1-7');
    const weak = { record: { ...rivalry.record, byOpening: { 'Defensa Siciliana': { games: 8, wins: 1, draws: 1, losses: 6 } } } };
    expect(resultMemoryComment('loss', weak, { opening: 'Defensa Siciliana', difficulty: 64 })).toBeNull();
  });

  it('en series activas sólo habla si el marcador tiene un momento narrativo importante', () => {
    const rivalry = { record: { recentGames: [], currentStreak: 0 } };
    const quiet = { bestOf: 5, winsNeeded: 3, humanWins: 1, cpuWins: 0, draws: 0, winner: null, games: [{ outcome: 'win' }] };
    expect(startMemoryComment(rivalry, { difficulty: 64, series: quiet })).toBeNull();
    expect(resultMemoryComment('win', rivalry, { series: quiet })).toBeNull();

    const matchPoint = { ...quiet, humanWins: 2, cpuWins: 1, games: [{ outcome: 'win' }, { outcome: 'loss' }, { outcome: 'win' }] };
    expect(startMemoryComment(rivalry, { difficulty: 64, series: matchPoint })).toContain('Punto de serie');
    expect(resultMemoryComment('win', rivalry, { series: matchPoint })).toContain('Punto de serie');
  });

});
