import { describe, expect, it } from 'vitest';
import { buildNemesisDossier, nemesisTrainingPosition, openingNemeses, openingNemesisTrend, tacticalNemesis } from './nemesis.js';

function game(id, outcome, opening = 'Defensa Siciliana', humanColor = 'w', difficulty = 60, date = `2026-08-${String(id).padStart(2, '0')}T10:00:00Z`) {
  return {
    id: `g-${id}`,
    date,
    mode: 'casual',
    outcome,
    opening,
    humanColor,
    difficulty,
    moves: [
      { san: 'e4' }, { san: 'c5' }, { san: 'Nf3' }, { san: 'd6' },
      { san: 'd4' }, { san: 'cxd4' }, { san: 'Nxd4' }, { san: 'Nf6' },
      { san: 'Nc3' }, { san: 'a6' }, { san: 'Be3' },
    ],
  };
}

describe('openingNemeses', () => {
  it('exige muestra y mal rendimiento real por apertura + color', () => {
    const history = [
      game(1, 'loss'), game(2, 'loss'), game(3, 'draw'), game(4, 'loss'),
      game(5, 'win', 'Apertura Italiana'), game(6, 'win', 'Apertura Italiana'),
      game(7, 'loss', 'Defensa Siciliana', 'b'), game(8, 'loss', 'Defensa Siciliana', 'b'),
    ];
    const rows = openingNemeses(history);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ opening: 'Defensa Siciliana', humanColor: 'w', games: 4, wins: 0, draws: 1, losses: 3, scorePct: 13, status: 'active' });
    expect(rows[0].confidence.key).toBe('initial');
  });

  it('ignora modos de entrenamiento aunque pierdas de forma espectacular', () => {
    const rows = [1, 2, 3, 4].map((i) => ({ ...game(i, 'loss'), mode: 'practice' }));
    expect(openingNemeses(rows)).toEqual([]);
  });

  it('retira una némesis histórica cuando cuatro resultados recientes prueban recuperación', () => {
    const history = [
      ...Array.from({ length: 8 }, (_, i) => game(i + 1, 'loss', 'Defensa Siciliana', 'w', 60, `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00Z`)),
      game(20, 'win', 'Defensa Siciliana', 'w', 60, '2026-08-20T10:00:00Z'),
      game(21, 'win', 'Defensa Siciliana', 'w', 60, '2026-08-21T10:00:00Z'),
      game(22, 'draw', 'Defensa Siciliana', 'w', 60, '2026-08-22T10:00:00Z'),
      game(23, 'win', 'Defensa Siciliana', 'w', 60, '2026-08-23T10:00:00Z'),
    ];
    expect(openingNemeses(history)).toEqual([]);
    expect(openingNemeses(history, { includeRecovered: true })[0]).toMatchObject({ recovered: true, status: 'recovered', recentScorePct: 88, recentLosses: 0 });
  });

  it('al resolver la peor apertura promueve la siguiente debilidad real', () => {
    const sicilianOldLosses = Array.from({ length: 8 }, (_, i) => game(i + 1, 'loss', 'Defensa Siciliana', 'w', 60, `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00Z`));
    const sicilianRecovery = [
      game(20, 'win', 'Defensa Siciliana', 'w', 60, '2026-08-20T10:00:00Z'),
      game(21, 'win', 'Defensa Siciliana', 'w', 60, '2026-08-21T10:00:00Z'),
      game(22, 'draw', 'Defensa Siciliana', 'w', 60, '2026-08-22T10:00:00Z'),
      game(23, 'win', 'Defensa Siciliana', 'w', 60, '2026-08-23T10:00:00Z'),
    ];
    const french = [
      game(30, 'loss', 'Defensa Francesa', 'b', 55, '2026-08-24T10:00:00Z'),
      game(31, 'loss', 'Defensa Francesa', 'b', 55, '2026-08-25T10:00:00Z'),
      game(32, 'draw', 'Defensa Francesa', 'b', 55, '2026-08-26T10:00:00Z'),
      game(33, 'loss', 'Defensa Francesa', 'b', 55, '2026-08-27T10:00:00Z'),
    ];
    const dossier = buildNemesisDossier([...sicilianOldLosses, ...sicilianRecovery, ...french]);
    expect(dossier.opening).toMatchObject({ opening: 'Defensa Francesa', humanColor: 'b' });
    expect(dossier.recoveredOpening).toMatchObject({ opening: 'Defensa Siciliana', recovered: true });
  });

  it('marca mejora sólo cuando la ventana reciente supera claramente el histórico', () => {
    const rows = [
      game(1, 'loss'), game(2, 'loss'), game(3, 'loss'), game(4, 'loss'), game(5, 'loss'),
      game(6, 'loss'), game(7, 'win'), game(8, 'draw'), game(9, 'draw'), game(10, 'loss'),
    ];
    const trend = openingNemesisTrend(rows, 20);
    expect(trend).toMatchObject({ improving: true, recovered: false, status: 'improving', recentScorePct: 50 });
  });
});

describe('tacticalNemesis', () => {
  it('sólo declara patrón con reincidencia medible', () => {
    expect(tacticalNemesis({ incidents: { 'cpu:KNIGHT_FORK': 1 } })).toBeNull();
    expect(tacticalNemesis({ incidents: { 'cpu:KNIGHT_FORK': 3, 'human:MISSED_MATE': 2 } })).toEqual({
      key: 'cpu:KNIGHT_FORK', count: 3, label: 'horquillas de caballo sufridas',
    });
  });
});

describe('nemesisTrainingPosition', () => {
  it('reproduce una posición real y devuelve el turno al humano', () => {
    const target = nemesisTrainingPosition(game(1, 'loss'));
    expect(target).toBeTruthy();
    expect(target.humanColor).toBe('w');
    expect(target.ply % 2).toBe(0);
    expect(target.fen.split(' ')[1]).toBe('w');
    expect(target.sourceRecord.id).toBe('g-1');
  });

  it('también alinea correctamente el turno cuando el humano lleva negras', () => {
    const record = game(1, 'loss', 'Defensa Siciliana', 'b');
    const target = nemesisTrainingPosition(record);
    expect(target).toBeTruthy();
    expect(target.ply % 2).toBe(1);
    expect(target.fen.split(' ')[1]).toBe('b');
  });
});

describe('buildNemesisDossier', () => {
  it('une apertura, patrón táctico y posición entrenable sin inventar datos', () => {
    const history = [game(1, 'loss'), game(2, 'loss'), game(3, 'draw'), game(4, 'loss')];
    const dossier = buildNemesisDossier(history, { incidents: { 'human:ALLOWED_MATE': 2 } });
    expect(dossier.opening.opening).toBe('Defensa Siciliana');
    expect(dossier.tactic.label).toContain('mates');
    expect(dossier.training.fen).toBeTruthy();
  });
});
