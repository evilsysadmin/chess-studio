import { describe, expect, it } from 'vitest';
import { personalTrainingDebtSummary, personalTrainingDebts } from './trainingDebt.js';

function puzzle(id, overrides = {}) {
  return {
    id,
    source: 'autopsy',
    sourceGameId: `game-${id}`,
    incidentKeys: ['human:MISSED_MATE'],
    cleanSolves: 0,
    solves: 0,
    ...overrides,
  };
}

describe('deuda de errores recurrentes', () => {
  it('un incidente aislado no se inventa como deuda recurrente', () => {
    expect(personalTrainingDebts([puzzle('uno')])).toEqual([]);
  });

  it('dos posiciones reales distintas abren una deuda', () => {
    const [debt] = personalTrainingDebts([puzzle('a'), puzzle('b')]);
    expect(debt).toMatchObject({
      incidentKey: 'human:MISSED_MATE',
      cases: 2,
      distinctGames: 2,
      cleanCases: 0,
      progress: 0,
      target: 2,
      active: true,
      paid: false,
    });
  });

  it('resolver muchas veces el mismo caso no paga una reincidencia', () => {
    const [debt] = personalTrainingDebts([
      puzzle('a', { cleanSolves: 4, solves: 4 }),
      puzzle('b'),
    ]);
    expect(debt).toMatchObject({ cleanCases: 1, progress: 1, active: true });
  });

  it('dos casos distintos resueltos limpiamente amortizan la deuda', () => {
    const summary = personalTrainingDebtSummary([
      puzzle('a', { cleanSolves: 1, solves: 1 }),
      puzzle('b', { cleanSolves: 2, solves: 2 }),
      puzzle('c'),
    ]);
    expect(summary.activeCount).toBe(0);
    expect(summary.paidCount).toBe(1);
    expect(summary.debts[0]).toMatchObject({ cases: 3, cleanCases: 2, progress: 2, paid: true });
  });

  it('variantes de IA no convierten por sí solas una sospecha en antecedente real', () => {
    expect(personalTrainingDebts([
      puzzle('real'),
      puzzle('ai', { source: 'workers-ai-validated' }),
    ])).toEqual([]);
  });

  it('ordena primero las deudas activas con más reincidencias', () => {
    const debts = personalTrainingDebts([
      puzzle('mate-a'), puzzle('mate-b'),
      puzzle('fork-a', { incidentKeys: ['cpu:KNIGHT_FORK'] }),
      puzzle('fork-b', { incidentKeys: ['cpu:KNIGHT_FORK'] }),
      puzzle('fork-c', { incidentKeys: ['cpu:KNIGHT_FORK'] }),
    ]);
    expect(debts.map((debt) => debt.incidentKey)).toEqual(['cpu:KNIGHT_FORK', 'human:MISSED_MATE']);
  });
});
