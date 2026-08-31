import { describe, expect, it } from 'vitest';
import { buildMatthiasPersonalCampaign } from './matthiasPersonalCampaign.js';

const puzzles = [
  { id: 'a', source: 'autopsy', incidentKeys: ['human:MISSED_MATE'] },
  { id: 'b', source: 'autopsy', incidentKeys: ['human:MISSED_MATE'] },
];

describe('campaña personal de Matthias', () => {
  it('no fabrica campaña si la memoria no contiene capítulos medidos', () => {
    expect(buildMatthiasPersonalCampaign(null, { history: [], puzzles: [] })).toBeNull();
    expect(buildMatthiasPersonalCampaign({}, { history: [], puzzles: [] })).toBeNull();
  });

  it('prioriza el reto real de reincidencia y enlaza sólo material personal existente', () => {
    const campaign = buildMatthiasPersonalCampaign({
      activeChallenge: {
        id: 'clean-run:human:MISSED_MATE',
        label: '3 partidas sin repetir: Ver mates antes de que sea demasiado tarde',
        incident_key: 'human:MISSED_MATE',
        baseline_games: 20,
        current_games: 22,
        target_games: 3,
        setbacks: 1,
      },
      activeGoals: [{
        id: 'incident:human:MISSED_MATE',
        label: 'Ver mates antes de que sea demasiado tarde',
        metric: 'incidents_per_game',
        baseline: 0.20,
        current: 0.16,
        baseline_games: 20,
        current_games: 22,
      }],
      relationship: { label: 'Habitual del despacho' },
      respect: { label: 'Respeto ganado' },
    }, { history: [], puzzles });

    expect(campaign.current).toMatchObject({
      kind: 'challenge',
      progress: 2,
      target: 3,
      action: 'personal-filter',
      filter: { incidentKey: 'human:MISSED_MATE' },
    });
    expect(campaign.current.detail).toContain('1 reinicio registrado');
    expect(campaign.queue[0]).toMatchObject({ kind: 'goal' });
    expect(campaign.respect).toBe('Respeto ganado');
  });

  it('explica el progreso táctico con la regla real de reducción del 30%', () => {
    const campaign = buildMatthiasPersonalCampaign({
      activeGoals: [{
        id: 'incident:human:MISSED_MATE',
        label: 'Ver mates antes de que sea demasiado tarde',
        metric: 'incidents_per_game',
        baseline: 0.20,
        current: 0.17,
        baseline_games: 10,
        current_games: 12,
      }],
    }, { history: [], puzzles });

    expect(campaign.current.kind).toBe('goal');
    expect(campaign.current.progressPct).toBe(50);
    expect(campaign.current.progressLabel).toContain('20.0 → 17.0');
    expect(campaign.current.detail).toContain('2/3 partidas nuevas mínimas');
  });

  it('explica el progreso de apertura con +15 puntos y tres muestras nuevas', () => {
    const campaign = buildMatthiasPersonalCampaign({
      activeGoals: [{
        id: 'opening:Caro-Kann',
        label: 'Levantar Caro-Kann',
        metric: 'opening_win_pct',
        baseline: 30,
        current: 39,
        baseline_games: 5,
        current_games: 7,
      }],
    }, { history: [], puzzles: [] });

    expect(campaign.current).toMatchObject({ kind: 'goal', progressPct: 60, progressLabel: '30% → 39%' });
    expect(campaign.current.detail).toContain('2/3 muestras nuevas mínimas');
  });

  it('sólo considera cerrados los milestones de objetivo o reto que el backend ya certificó', () => {
    const campaign = buildMatthiasPersonalCampaign({
      recentMilestones: [
        { fingerprint: 'first-win', kind: 'first_win', polarity: 'fame', label: 'Primera victoria registrada' },
        { fingerprint: 'goal-1', kind: 'goal_completed', polarity: 'fame', label: 'Objetivo superado: Táctica' },
        { fingerprint: 'shame-1', kind: 'conversion', polarity: 'shame', label: 'Ahogado' },
        { fingerprint: 'challenge-1', kind: 'challenge_completed', polarity: 'fame', label: 'Expediente cerrado: 3 partidas limpias' },
      ],
    }, { history: [], puzzles: [] });

    expect(campaign.current).toBeNull();
    expect(campaign.completed.map((row) => row.kind)).toEqual(['challenge_completed', 'goal_completed']);
  });

  it('muestra Némesis desde memoria pero no ofrece revancha si no puede reconstruir una derrota real', () => {
    const campaign = buildMatthiasPersonalCampaign({
      nemesisOpening: { name: 'Siciliana', games: 7, win_pct: 28 },
    }, { history: [], puzzles: [] });

    expect(campaign.current).toMatchObject({ kind: 'nemesis', title: 'Némesis: Siciliana', action: null });
    expect(campaign.current.detail).toContain('7 partidas registradas');
  });
});
