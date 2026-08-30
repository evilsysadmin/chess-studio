import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import {
  clearInsightsWorkspaceState,
  loadInsightsWorkspaceState,
  rememberInsightsWorkspaceState,
} from './insightsWorkspaceState.js';

describe('insights workspace session state', () => {
  beforeEach(() => {
    clearStorageMemoryFallback();
    clearInsightsWorkspaceState();
  });

  it('recuerda sección y subvista dentro de la sesión', () => {
    rememberInsightsWorkspaceState({ section: 'diagnosis', diagnosisView: 'errors' });
    expect(loadInsightsWorkspaceState()).toEqual({ section: 'diagnosis', diagnosisView: 'errors' });

    rememberInsightsWorkspaceState({ diagnosisView: 'dossier' });
    expect(loadInsightsWorkspaceState()).toEqual({ section: 'diagnosis', diagnosisView: 'dossier' });
  });

  it('se puede limpiar al salir explícitamente del workspace', () => {
    rememberInsightsWorkspaceState({ section: 'career', diagnosisView: 'errors' });
    clearInsightsWorkspaceState();
    expect(loadInsightsWorkspaceState()).toEqual({});
  });
});
