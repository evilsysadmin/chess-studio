import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  careerModuleLoaded: vi.fn(),
  dossierModuleLoaded: vi.fn(),
}));

vi.mock('./CareerScreen.jsx', () => {
  boundary.careerModuleLoaded();
  return { default: () => null };
});

vi.mock('./InsightsDossierContent.jsx', () => {
  boundary.dossierModuleLoaded();
  return { default: () => null };
});

vi.mock('./CareerActivityCalendar.jsx', () => ({ default: () => null }));
vi.mock('./InsightsCleanGames.jsx', () => ({ default: () => null }));

describe('Insights panel dependency boundaries', () => {
  beforeEach(() => {
    vi.resetModules();
    boundary.careerModuleLoaded.mockClear();
    boundary.dossierModuleLoaded.mockClear();
  });

  it('Expediente carga su dossier sin cargar CareerScreen', async () => {
    await import('./InsightsDossierPanel.jsx');

    expect(boundary.dossierModuleLoaded).toHaveBeenCalledTimes(1);
    expect(boundary.careerModuleLoaded).not.toHaveBeenCalled();
  });

  it('Mi progreso carga CareerScreen sin cargar el dossier', async () => {
    await import('./InsightsCareerPanel.jsx');

    expect(boundary.careerModuleLoaded).toHaveBeenCalledTimes(1);
    expect(boundary.dossierModuleLoaded).not.toHaveBeenCalled();
  });
});
