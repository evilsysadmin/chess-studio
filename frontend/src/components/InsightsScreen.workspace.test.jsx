import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./InsightsDashboardContent.jsx', () => ({
  default: ({ initialSection }) => <div data-insights-dashboard={initialSection}>dashboard</div>,
}));
vi.mock('./MechanicTutorialHelp.jsx', () => ({ default: () => <span data-insights-help="true">help</span> }));

import InsightsScreen, { normalizeInsightsSection } from './InsightsScreen.jsx';

describe('InsightsScreen Matthias-led coaching workspace', () => {
  it('abre Así juegas en Ahora con Matthias como guía y sólo tres áreas', () => {
    const html = renderToStaticMarkup(<InsightsScreen onExit={() => {}} initialSection="diagnosis" />);

    expect(html).toContain('Así juegas');
    expect(html).toContain('Mi progreso');
    expect(html).toContain('Matthias revisa tus datos');
    expect(html).toContain('Ahora');
    expect(html).toContain('Errores');
    expect(html).toContain('Reincidencias y evidencia real');
    expect(html).toContain('Expediente');
    expect(html).toContain('insights-workspace-view-now');
    expect(html).toContain('id="insights-view-now"');
    expect(html).not.toContain('id="insights-view-matthias"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('data-insights-dashboard="diagnosis"');
  });

  it('mantiene Mi progreso como sección superior independiente', () => {
    const html = renderToStaticMarkup(<InsightsScreen onExit={() => {}} initialSection="career" />);

    expect(html).toContain('insights-workspace-section-career');
    expect(html).toContain('data-insights-dashboard="career"');
    expect(html).not.toContain('aria-label="Áreas de Así juegas"');
  });

  it('normaliza cualquier sección desconocida hacia el diagnóstico', () => {
    expect(normalizeInsightsSection('career')).toBe('career');
    expect(normalizeInsightsSection('whatever')).toBe('diagnosis');
  });
});