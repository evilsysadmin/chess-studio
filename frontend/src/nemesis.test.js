import { describe, expect, it } from 'vitest';
import { buildNemesisDossier, nemesisTrainingPosition, openingNemeses, tacticalNemesis } from './nemesis.js';

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
    expect(rows[0]).toMatchObject({ opening: 'Defensa Siciliana', humanColor: 'w', games: 4, wins: 0, draws: 1, losses: 3, scorePct: 13 });
    expect(rows[0].confidence.key).toBe('initial');
  });

  it('ignora modos de entrenamiento aunque pierdas de forma espectacular', () => {
    const rows = [1, 2, 3, 4].map((i) => ({ ...game(i, 'loss'), mode: 'practice' }));
    expect(openingNemeses(rows)).toEqual([]);
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
