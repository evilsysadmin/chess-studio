import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import {
  DEFAULT_RADIO_RETIRED_THEME_IDS,
  migratePersistentStorage,
  STORAGE_SCHEMA_KEY,
} from './storageMigrations.js';
import {
  AMBIENT_THEME_OPTIONS,
  ambientRadioThemeIds,
  isAmbientExcluded,
  toggleAmbientExcluded,
} from './sound.js';

describe('curación persistente de la radio automática', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearStorageMemoryFallback();
    localStorage.setItem(STORAGE_SCHEMA_KEY, '3');
  });

  it('retira los temas regionales del sorteo pero los conserva en el catálogo', () => {
    migratePersistentStorage();

    const randomPool = new Set(ambientRadioThemeIds('all'));
    const catalog = new Set(AMBIENT_THEME_OPTIONS.map((theme) => theme.id));

    for (const id of DEFAULT_RADIO_RETIRED_THEME_IDS) {
      expect(catalog.has(id), `${id} sigue seleccionable`).toBe(true);
      expect(isAmbientExcluded(id), `${id} queda retirado del pool`).toBe(true);
      expect(randomPool.has(id), `${id} no debe sortearse`).toBe(false);
    }
  });

  it('permite reactivar manualmente una pieza retirada y no la vuelve a imponer', () => {
    migratePersistentStorage();
    expect(isAmbientExcluded('beirut0113')).toBe(true);

    toggleAmbientExcluded('beirut0113');
    expect(isAmbientExcluded('beirut0113')).toBe(false);
    expect(ambientRadioThemeIds('all')).toContain('beirut0113');

    migratePersistentStorage();
    expect(isAmbientExcluded('beirut0113')).toBe(false);
    expect(ambientRadioThemeIds('all')).toContain('beirut0113');
  });
});
