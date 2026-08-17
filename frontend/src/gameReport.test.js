import { describe, it, expect, beforeEach } from 'vitest';
import { moveLoss, performanceLabel, mistakeSeverity, analyzeGame, analyzeCombatLog, findWorstMoveEver } from './gameReport.js';
import { loadCombatHistory, saveCombatBattle, clearCombatHistory } from './combatHistory.js';

beforeEach(() => localStorage.clear());

describe('moveLoss', () => {
  it('da 0 si la jugada real evaluó igual o mejor que la sugerida', () => {
    expect(moveLoss('w', 50, 50)).toBe(0);
    expect(moveLoss('w', 50, 90)).toBe(0); // mejor que lo sugerido, nunca negativo
  });

  it('da positivo si la jugada real fue peor, desde la perspectiva de quien movió', () => {
    expect(moveLoss('w', 50, 10)).toBe(40);
    expect(moveLoss('b', -50, 10)).toBe(60); // para negras, un eval más alto (favorece blancas) es peor
  });

  it('da null si hay un jaque mate de por medio (valores infinitos)', () => {
    expect(moveLoss('w', Infinity, 50)).toBeNull();
    expect(moveLoss('w', 50, null)).toBeNull();
  });
});

describe('performanceLabel', () => {
  it('escala de "mucha precisión" a "se alejaron bastante" según la pérdida promedio', () => {
    expect(performanceLabel(5)).toMatch(/precisión/);
    expect(performanceLabel(300)).toMatch(/alejaron/);
  });
});

describe('mistakeSeverity', () => {
  it('clasifica la pérdida en un semáforo de severidad', () => {
    expect(mistakeSeverity(null)).toBe('unrated');
    expect(mistakeSeverity(5)).toBe('ok');
    expect(mistakeSeverity(30)).toBe('inaccuracy');
    expect(mistakeSeverity(100)).toBe('mistake');
    expect(mistakeSeverity(200)).toBe('blunder');
  });
});

describe('analyzeGame', () => {
  it('solo analiza las jugadas del color humano, y arma el resumen correctamente', async () => {
    const history = [
      { san: 'e4', from: 'e2', to: 'e4' },
      { san: 'e5', from: 'e7', to: 'e5' },
      { san: 'Qh5', from: 'd1', to: 'h5' }, // jugada mala del humano (blancas)
      { san: 'Nc6', from: 'b8', to: 'c6' },
    ];
    let callCount = 0;
    const mockApi = {
      analyzeMove: async (fen, from, to) => {
        callCount += 1;
        if (from === 'd1' && to === 'h5') {
          return { suggested: { san: 'Nf3', from: 'g1', to: 'f3' }, evalAfterSuggested: 30, evalAfterPlayed: 10 };
        }
        return { suggested: { san: 'algo', from: 'a1', to: 'a2' }, evalAfterSuggested: 20, evalAfterPlayed: 20 };
      },
    };
    const report = await analyzeGame(history, 'w', mockApi, { throttleMs: 1 });
    expect(callCount).toBe(2); // solo las 2 jugadas de blancas, nunca las de negras
    expect(report.analyzedCount).toBe(2);
    expect(report.worst.played).toBe('Qh5');
    expect(report.worst.loss).toBe(20);

    // El listado completo trae las casillas exactas, para poder dibujar la
    // sugerencia en el tablero — la reconstrucción visual depende de esto.
    expect(report.moveReports).toHaveLength(2);
    const badMove = report.moveReports.find((m) => m.played === 'Qh5');
    expect(badMove.index).toBe(2); // posición dentro de `history`
    expect(badMove.playedFrom).toBe('d1');
    expect(badMove.playedTo).toBe('h5');
    expect(badMove.suggestedFrom).toBe('g1');
    expect(badMove.suggestedTo).toBe('f3');
    expect(badMove.severity).toBe('inaccuracy'); // pérdida de 20
  });

  it('respeta el límite de jugadas a analizar, quedándose con las últimas', async () => {
    // Secuencia de jugadas legales que se repite (caballos van y vuelven a
    // casa), para tener una partida "larga" válida sin que chess.move()
    // reviente por notación inválida.
    const pattern = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    const history = [];
    for (let i = 0; i < 40; i++) {
      const san = pattern[i % 4];
      const from = san === 'Nf3' ? 'g1' : san === 'Nf6' ? 'g8' : san === 'Ng1' ? 'f3' : 'f6';
      const to = san === 'Nf3' ? 'f3' : san === 'Nf6' ? 'f6' : san === 'Ng1' ? 'g1' : 'g8';
      history.push({ san, from, to });
    }
    let callCount = 0;
    const mockApi = {
      analyzeMove: async () => {
        callCount += 1;
        return { suggested: { san: 'x' }, evalAfterSuggested: 0, evalAfterPlayed: 0 };
      },
    };
    await analyzeGame(history, 'w', mockApi, { maxMoves: 5, throttleMs: 1 });
    expect(callCount).toBe(5);
  });
});

describe('combatHistory', () => {
  it('arranca vacío, guarda la más reciente primero, y respeta el límite de 25', () => {
    expect(loadCombatHistory()).toEqual([]);

    saveCombatBattle({ id: 'b1', date: '2026-01-01', outcome: 'win', log: [] });
    saveCombatBattle({ id: 'b2', date: '2026-01-02', outcome: 'loss', log: [] });
    saveCombatBattle({ id: 'b3', date: '2026-01-03', outcome: 'draw', log: [] });
    expect(loadCombatHistory().map((b) => b.id)).toEqual(['b3', 'b2', 'b1']);

    for (let i = 0; i < 30; i++) saveCombatBattle({ id: `x${i}`, date: '2026', outcome: 'win', log: [] });
    expect(loadCombatHistory()).toHaveLength(25);

    clearCombatHistory();
    expect(loadCombatHistory()).toEqual([]);
  });
});

describe('analyzeCombatLog', () => {
  it('solo analiza los intentos del humano, con las casillas exactas de la sugerencia', async () => {
    const log = [
      { fenBefore: 'fen0', fenAfter: 'fen1', san: 'e4', from: 'e2', to: 'e4', captured: false, by: 'human' },
      { fenBefore: 'fen1', fenAfter: 'fen2', san: 'e5', from: 'e7', to: 'e5', captured: false, by: 'cpu' },
      { fenBefore: 'fen2', fenAfter: 'fen3', san: 'Qh5', from: 'd1', to: 'h5', captured: false, by: 'human' },
    ];
    let callCount = 0;
    const mockApi = {
      analyzeMove: async (fen, from, to) => {
        callCount += 1;
        if (from === 'd1' && to === 'h5') {
          return { suggested: { san: 'Nf3', from: 'g1', to: 'f3' }, evalAfterSuggested: 30, evalAfterPlayed: -10 };
        }
        return { suggested: { san: 'algo', from: 'a1', to: 'a2' }, evalAfterSuggested: 20, evalAfterPlayed: 20 };
      },
    };

    const report = await analyzeCombatLog(log, 'w', mockApi, { throttleMs: 1 });
    expect(callCount).toBe(2); // solo las 2 jugadas del humano, nunca las de la CPU
    expect(report.worst.played).toBe('Qh5');
    expect(report.worst.loss).toBe(40);
    expect(report.worst.suggestedFrom).toBe('g1');
    expect(report.worst.suggestedTo).toBe('f3');
    expect(report.worst).not.toHaveProperty('hit'); // ya no existe: solo se loggean los aciertos
  });
});

describe('findWorstMoveEver', () => {
  const gameHistory = [
    { id: 'g1', humanColor: 'w', moves: [{ san: 'e4', from: 'e2', to: 'e4' }, { san: 'e5', from: 'e7', to: 'e5' }, { san: 'Qh5', from: 'd1', to: 'h5' }, { san: 'Nc6', from: 'b8', to: 'c6' }] },
    { id: 'g2', humanColor: 'w', moves: [{ san: 'd4', from: 'd2', to: 'd4' }, { san: 'd5', from: 'd7', to: 'd5' }] },
  ];
  const combatHistory = [
    { id: 'c1', humanColor: 'w', log: [{ san: 'e4', from: 'e2', to: 'e4', by: 'human' }, { san: 'e5', from: 'e7', to: 'e5', by: 'cpu' }, { san: 'Bxf7', from: 'f1', to: 'f7', by: 'human' }] },
  ];
  const mockApi = {
    analyzeMove: async (fen, from, to) => {
      if (from === 'd1' && to === 'h5') return { suggested: { san: 'Nf3', from: 'g1', to: 'f3' }, evalAfterSuggested: 30, evalAfterPlayed: -200 };
      if (from === 'f1' && to === 'f7') return { suggested: { san: 'Nf3', from: 'g1', to: 'f3' }, evalAfterSuggested: 20, evalAfterPlayed: -30 };
      return { suggested: { san: 'algo', from: 'a1', to: 'a2' }, evalAfterSuggested: 20, evalAfterPlayed: 15 };
    },
  };

  it('encuentra la peor jugada entre partidas normales Y de combate juntas', async () => {
    const { best } = await findWorstMoveEver(gameHistory, combatHistory, mockApi, () => {}, () => false, { throttleMs: 1 });
    expect(best.moveReport.played).toBe('Qh5');
    expect(best.moveReport.loss).toBe(230);
    expect(best.kind).toBe('game');
    expect(best.record.id).toBe('g1');
  });

  it('reporta progreso después de cada partida, con el mejor candidato parcial', async () => {
    const progress = [];
    await findWorstMoveEver(gameHistory, combatHistory, mockApi, (done, total, best) => {
      progress.push({ done, total, bestLoss: best?.moveReport.loss ?? null });
    }, () => false, { throttleMs: 1 });
    expect(progress).toHaveLength(3); // 2 partidas + 1 batalla
    expect(progress[progress.length - 1].bestLoss).toBe(230);
  });

  it('se puede cancelar a mitad de camino, conservando el resultado parcial', async () => {
    let calls = 0;
    const { best } = await findWorstMoveEver(gameHistory, combatHistory, mockApi, () => {}, () => {
      calls += 1;
      return calls > 1; // corta después de la primera partida
    }, { throttleMs: 1 });
    expect(best.moveReport.played).toBe('Qh5'); // ya la había encontrado en la primera
  });

  it('si una jugada puntual falla el análisis, se salta pero las demás de esa partida se siguen analizando', async () => {
    const flakyApi = {
      analyzeMove: async (fen, from, to) => {
        if (from === 'd1' && to === 'h5') throw new Error('fallo simulado');
        return { suggested: { san: 'algo', from: 'a1', to: 'a2' }, evalAfterSuggested: 20, evalAfterPlayed: 15 };
      },
    };
    const { best } = await findWorstMoveEver(gameHistory, [], flakyApi, () => {}, () => false, { throttleMs: 1 });
    // Qh5 (índice 2) revienta y se descarta, pero e4 (índice 0, la otra
    // jugada humana de g1) sí se analiza bien — el resultado no queda vacío.
    expect(best.moveReport.played).toBe('e4');
    expect(best.record.id).toBe('g1');
  });

  it('devuelve un caché con una entrada por cada partida/batalla analizada', async () => {
    const { cache } = await findWorstMoveEver(gameHistory, combatHistory, mockApi, () => {}, () => false, { throttleMs: 1 });
    expect(Object.keys(cache).sort()).toEqual(['c1', 'g1', 'g2']);
    expect(cache.g1.worst.played).toBe('Qh5');
    // g2 (d4) sí tiene un loss válido y chico (20-15=5) — no es null, apenas no es "el peor"
    expect(cache.g2.worst.played).toBe('d4');
    expect(cache.g2.worst.loss).toBe(5);
  });

  it('una partida ya en el caché NO vuelve a llamar al backend', async () => {
    let calls = 0;
    const countingApi = {
      analyzeMove: async (fen, from, to) => {
        calls += 1;
        if (from === 'd1' && to === 'h5') return { suggested: { san: 'Nf3', from: 'g1', to: 'f3' }, evalAfterSuggested: 30, evalAfterPlayed: -200 };
        return { suggested: { san: 'algo', from: 'a1', to: 'a2' }, evalAfterSuggested: 20, evalAfterPlayed: 15 };
      },
    };
    // primera búsqueda: arma el caché desde cero
    const first = await findWorstMoveEver(gameHistory, [], countingApi, () => {}, () => false, { throttleMs: 1 });
    const callsAfterFirst = calls;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // segunda búsqueda, mismo historial, pasando el caché de la vez pasada
    const second = await findWorstMoveEver(gameHistory, [], countingApi, () => {}, () => false, { throttleMs: 1, cache: first.cache });
    expect(calls).toBe(callsAfterFirst); // ni una llamada mas al backend
    expect(second.best.moveReport.played).toBe('Qh5'); // el resultado sigue siendo correcto, servido desde el caché
  });

  it('poda del caché las entradas de partidas que ya no están en el historial', async () => {
    const staleCache = {
      g1: { worst: { played: 'algo-viejo', loss: 999 }, analyzedAt: '2020-01-01' },
      'partida-borrada-hace-rato': { worst: { played: 'x', loss: 500 }, analyzedAt: '2019-01-01' },
    };
    const { cache } = await findWorstMoveEver(gameHistory, combatHistory, mockApi, () => {}, () => false, { throttleMs: 1, cache: staleCache });
    expect(Object.keys(cache)).not.toContain('partida-borrada-hace-rato');
    // g1 SI seguia en el historial -- se conserva su entrada del cache (no se reanaliza)
    expect(cache.g1.worst.played).toBe('algo-viejo');
  });
});
