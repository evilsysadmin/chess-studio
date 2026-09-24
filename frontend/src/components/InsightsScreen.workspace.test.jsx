import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const modelMocks = vi.hoisted(() => ({
  loadPersonalPuzzles: vi.fn(),
  loadCleanGameRecords: vi.fn(),
  loadRivalry: vi.fn(),
  buildPlayerModel: vi.fn(),
}));

vi.mock('../personalPuzzles.js', () => ({
  loadPersonalPuzzles: modelMocks.loadPersonalPuzzles,
}));
vi.mock('../cleanGames.js', () => ({
  loadCleanGameRecords: modelMocks.loadCleanGameRecords,
}));
vi.mock('../rivalry.js', () => ({
  loadRivalry: modelMocks.loadRivalry,
}));
vi.mock('../playerModel.js', () => ({
  buildPlayerModel: modelMocks.buildPlayerModel,
}));

vi.mock('./InsightsDashboardContent.jsx', () => ({
  default: ({ initialSection, playerModel, personalPuzzles, cleanGameRecords }) => (
    <div
      data-insights-dashboard={initialSection}
      data-player-model={playerModel?.version || 'none'}
      data-dashboard-puzzle-snapshot={personalPuzzles?.length || 0}
      data-dashboard-clean-snapshot={Object.keys(cleanGameRecords || {}).length}
    >dashboard</div>
  ),
}));
vi.mock('./InsightsRecurringErrors.jsx', () => ({
  default: ({ playerModel }) => <section data-recurring-errors="true" data-player-model={playerModel?.version || 'none'}>No vuelvas a hacer esto</section>,
}));
vi.mock('./InsightsCleanGames.jsx', () => ({
  default: ({ playerModel }) => <section data-clean-games="true" data-player-model={playerModel?.version || 'none'}>Partidas limpias</section>,
}));
vi.mock('./InsightsWeeklyGoals.jsx', () => ({
  default: ({ playerModel, personalPuzzles, cleanGameRecords }) => (
    <section
      data-weekly-goals="true"
      data-player-model={playerModel?.version || 'none'}
      data-puzzle-snapshot={personalPuzzles?.length || 0}
      data-clean-snapshot={Object.keys(cleanGameRecords || {}).length}
    >Objetivos personales</section>
  ),
}));
vi.mock('./InsightsGuidedSession.jsx', () => ({
  default: ({ playerModel, personalPuzzles, cleanGameRecords }) => (
    <section
      data-guided-session="true"
      data-player-model={playerModel?.version || 'none'}
      data-puzzle-snapshot={personalPuzzles?.length || 0}
      data-clean-snapshot={Object.keys(cleanGameRecords || {}).length}
    >Sesión automática</section>
  ),
}));
vi.mock('./InsightsMatthiasCampaign.jsx', () => ({
  default: () => <section data-matthias-campaign="true">Campaña personal de Matthias</section>,
}));
vi.mock('./MechanicTutorialHelp.jsx', () => ({ default: () => <span data-insights-help="true">help</span> }));

import InsightsScreen, { normalizeInsightsDiagnosisView, normalizeInsightsSection } from './InsightsScreen.jsx';

describe('InsightsScreen Matthias-led coaching workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelMocks.loadPersonalPuzzles.mockReturnValue([{ id: 'p1' }]);
    modelMocks.loadCleanGameRecords.mockReturnValue({ g1: { gameId: 'g1' } });
    modelMocks.loadRivalry.mockReturnValue({
      record: {
        byTimeControl: {
          '5+0': { games: 5, wins: 3, draws: 0, losses: 2 },
        },
      },
    });
    modelMocks.buildPlayerModel.mockReturnValue({ version: 7 });
  });

  it('construye una sola snapshot factual y la comparte con los consumidores de Así juegas', () => {
    const insights = { totalGames: 5 };
    const html = renderToStaticMarkup(
      <InsightsScreen
        onExit={() => {}}
        insights={insights}
        gameHistory={[{ id: 'g1' }]}
        initialSection="diagnosis"
      />,
    );

    expect(modelMocks.loadPersonalPuzzles).toHaveBeenCalledTimes(1);
    expect(modelMocks.loadCleanGameRecords).toHaveBeenCalledTimes(1);
    expect(modelMocks.loadRivalry).toHaveBeenCalledTimes(1);
    expect(modelMocks.buildPlayerModel).toHaveBeenCalledTimes(1);
    expect(modelMocks.buildPlayerModel).toHaveBeenCalledWith({
      insights,
      personalPuzzles: [{ id: 'p1' }],
      cleanGameRecords: { g1: { gameId: 'g1' } },
      timeControlStats: {
        '5+0': { games: 5, wins: 3, draws: 0, losses: 2 },
      },
    });
    expect(html.match(/data-player-model="7"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('data-puzzle-snapshot="1"');
    expect(html).toContain('data-clean-snapshot="1"');
    expect(html).toContain('data-dashboard-puzzle-snapshot="1"');
    expect(html).toContain('data-dashboard-clean-snapshot="1"');
  });

  it('abre Así juegas en Ahora con sesión guiada, campaña personal y objetivos semanales', () => {
    const html = renderToStaticMarkup(<InsightsScreen onExit={() => {}} initialSection="diagnosis" />);

    expect(html).toContain('Así juegas');
    expect(html).toContain('Mi progreso');
    expect(html).toContain('Matthias revisa tus datos');
    expect(html).toContain('Ahora');
    expect(html).toContain('Errores');
    expect(html).toContain('Patrones y errores recurrentes');
    expect(html).toContain('Expediente');
    expect(html).toContain('insights-workspace-view-now');
    expect(html).toContain('id="insights-view-now"');
    expect(html).not.toContain('id="insights-view-matthias"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('data-insights-dashboard="diagnosis"');
    expect(html).toContain('data-guided-session="true"');
    expect(html).toContain('data-matthias-campaign="true"');
    expect(html).toContain('data-weekly-goals="true"');
    expect(html).not.toContain('data-recurring-errors="true"');
    expect(html).not.toContain('data-clean-games="true"');
    expect(html).not.toContain('data-career-activity-calendar="monthly-v1"');
  });

  it('reserva Errores para reincidencias reales y no mezcla orquestadores de Ahora con esa pestaña', () => {
    const html = renderToStaticMarkup(
      <InsightsScreen onExit={() => {}} initialSection="diagnosis" initialDiagnosisView="errors" />,
    );

    expect(html).toContain('insights-workspace-view-errors');
    expect(html).toContain('id="insights-view-errors"');
    expect(html).toContain('data-recurring-errors="true"');
    expect(html).toContain('No vuelvas a hacer esto');
    expect(html).not.toContain('data-insights-dashboard="diagnosis"');
    expect(html).not.toContain('data-weekly-goals="true"');
    expect(html).not.toContain('data-guided-session="true"');
    expect(html).not.toContain('data-matthias-campaign="true"');
  });

  it('reserva Expediente para métricas demostradas como Partidas limpias', () => {
    const html = renderToStaticMarkup(
      <InsightsScreen onExit={() => {}} initialSection="diagnosis" initialDiagnosisView="dossier" />,
    );

    expect(html).toContain('insights-workspace-view-dossier');
    expect(html).toContain('data-clean-games="true"');
    expect(html).not.toContain('data-insights-dashboard="diagnosis"');
    expect(html).not.toContain('data-weekly-goals="true"');
    expect(html).not.toContain('data-guided-session="true"');
    expect(html).not.toContain('data-matthias-campaign="true"');
    expect(html).not.toContain('data-recurring-errors="true"');
  });

  it('mantiene Mi progreso como sección superior independiente y añade sólo allí el calendario factual', () => {
    const html = renderToStaticMarkup(
      <InsightsScreen
        onExit={() => {}}
        initialSection="career"
        gameHistory={[{ id: 'w1', date: '2026-09-03T10:00:00', outcome: 'win' }]}
      />,
    );

    expect(html).toContain('insights-workspace-section-career');
    expect(html).toContain('data-insights-dashboard="career"');
    expect(html).toContain('data-career-activity-calendar="monthly-v1"');
    expect(html).toContain('Calendario de partidas');
    expect(html).not.toContain('aria-label="Áreas de Así juegas"');
    expect(html).not.toContain('data-recurring-errors="true"');
    expect(html).not.toContain('data-weekly-goals="true"');
    expect(html).not.toContain('data-guided-session="true"');
    expect(html).not.toContain('data-matthias-campaign="true"');
    expect(html).not.toContain('data-clean-games="true"');
  });

  it('normaliza cualquier sección o vista desconocida hacia sus defaults seguros', () => {
    expect(normalizeInsightsSection('career')).toBe('career');
    expect(normalizeInsightsSection('whatever')).toBe('diagnosis');
    expect(normalizeInsightsDiagnosisView('errors')).toBe('errors');
    expect(normalizeInsightsDiagnosisView('dossier')).toBe('dossier');
    expect(normalizeInsightsDiagnosisView('whatever')).toBe('now');
  });
});
