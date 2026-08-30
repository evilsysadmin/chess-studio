import { describe, expect, it } from 'vitest';
import { personalTrainingDebtSummary, personalTrainingDebts, trainingDebtFilter } from './trainingDebt.js';
import { buildInsightsErrorsModel } from './components/InsightsErrorsPanel.jsx';

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
  it('no convierte un incidente aislado en una debilidad inventada', () => {
    expect(personalTrainingDebts([puzzle('uno')])).toEqual([]);
  });

  it('abre deuda tras dos posiciones autobiográficas reales distintas', () => {
    const [debt] = personalTrainingDebts([puzzle('a'), puzzle('b')]);
    expect(debt).toMatchObject({
      incidentKey: 'human:MISSED_MATE',
      cases: 2,
      distinctGames: 2,
      progress: 0,
      target: 2,
      active: true,
      paid: false,
    });
    expect(trainingDebtFilter(debt)).toEqual({ incidentKey: 'human:MISSED_MATE', label: 'Mates ignorados' });
  });

  it('resolver muchas veces un solo caso no amortiza la reincidencia', () => {
    const [debt] = personalTrainingDebts([
      puzzle('a', { cleanSolves: 4, solves: 4 }),
      puzzle('b'),
    ]);
    expect(debt).toMatchObject({ cleanCases: 1, progress: 1, active: true });
  });

  it('dos casos distintos resueltos limpiamente pagan la deuda', () => {
    const summary = personalTrainingDebtSummary([
      puzzle('a', { cleanSolves: 1 }),
      puzzle('b', { cleanSolves: 2 }),
      puzzle('c'),
    ]);
    expect(summary).toMatchObject({ activeCount: 0, paidCount: 1 });
    expect(summary.debts[0]).toMatchObject({ cases: 3, progress: 2, paid: true });
  });

  it('Workers AI no fabrica antecedentes autobiográficos', () => {
    expect(personalTrainingDebts([
      puzzle('real'),
      puzzle('ai', { source: 'workers-ai-validated' }),
    ])).toEqual([]);
  });

  it('Errores separa deuda autobiográfica de registro histórico de incidentes', () => {
    const model = buildInsightsErrorsModel(
      [puzzle('a'), puzzle('b')],
      { incidents: { 'cpu:KNIGHT_FORK': 4, 'human:MISSED_MATE': 2, 'other:NOISE': 99 } },
    );
    expect(model.debt.activeCount).toBe(1);
    expect(model.incidents.map((row) => row.key)).toEqual(['cpu:KNIGHT_FORK', 'human:MISSED_MATE']);
  });
});
