import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./InsightsDashboardContent.jsx', () => ({
  default: ({ initialSection }) => <div data-insights-dashboard={initialSection}>dashboard</div>,
}));
vi.mock('./InsightsRecurringErrors.jsx', () => ({
  default: () => <section data-recurring-errors="true">No vuelvas a hacer esto</section>,
}));
vi.mock('./InsightsCleanGames.jsx', () => ({
  default: () => <section data-clean-games="true">Partidas limpias</section>,
}));
vi.mock('./InsightsWeeklyGoals.jsx', () => ({
  default: () => <section data-weekly-goals="true">Objetivos personales</section>,
}));
vi.mock('./InsightsGuidedSession.jsx', () => ({
  default: () => <section data-guided-session="true">Sesión automática</section>,
}));
vi.mock('./MechanicTutorialHelp.jsx', () => ({ default: () => <span data-insights-help="true">help</span> }));

import InsightsScreen, { normalizeInsightsDiagnosisView, normalizeInsightsSection } from './InsightsScreen.jsx';

describe('InsightsScreen Matthias-led coaching workspace', () => {
  it('abre Así juegas en Ahora con sesión guiada, objetivos semanales y sólo tres áreas', () => {
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
    expect(html).toContain('data-weekly-goals="true"');
    expect(html).not.toContain('data-recurring-errors="true"');
    expect(html).not.toContain('data-clean-games="true"');
  });

  it('reserva Errores para reincidencias reales y no mezcla la sesión guiada con esa pestaña', () => {
    const html = renderToStaticMarkup(
      <InsightsScreen onExit={() => {}} initialSection="diagnosis" initialDiagnosisView="errors" />,
    );

    expect(html).toContain('insights-workspace-view-errors');
    expect(html).toContain('id="insights-view-errors"');
    expect(html).toContain('data-recurring-errors="true"');
    expect(html).toContain('No vuelvas a hacer esto');
    expect(html).toContain('data-insights-dashboard="diagnosis"');
    expect(html).not.toContain('data-weekly-goals="true"');
    expect(html).not.toContain('data-guided-session="true"');
  });

  it('reserva Expediente para métricas demostradas como Partidas limpias', () => {
    const html = renderToStaticMarkup(
      <InsightsScreen onExit={() => {}} initialSection="diagnosis" initialDiagnosisView="dossier" />,
    );

    expect(html).toContain('insights-workspace-view-dossier');
    expect(html).toContain('data-clean-games="true"');
    expect(html).not.toContain('data-weekly-goals="true"');
    expect(html).not.toContain('data-guided-session="true"');
    expect(html).not.toContain('data-recurring-errors="true"');
  });

  it('mantiene Mi progreso como sección superior independiente', () => {
    const html = renderToStaticMarkup(<InsightsScreen onExit={() => {}} initialSection="career" />);

    expect(html).toContain('insights-workspace-section-career');
    expect(html).toContain('data-insights-dashboard="career"');
    expect(html).not.toContain('aria-label="Áreas de Así juegas"');
    expect(html).not.toContain('data-recurring-errors="true"');
    expect(html).not.toContain('data-weekly-goals="true"');
    expect(html).not.toContain('data-guided-session="true"');
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
