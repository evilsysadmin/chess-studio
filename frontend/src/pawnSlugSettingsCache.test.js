import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./safeStorage.js', () => ({
  STORAGE_LOCAL: 'local',
  readJsonStorage: vi.fn(),
  setStorageItem: vi.fn(),
}));

import { readJsonStorage, setStorageItem } from './safeStorage.js';
import {
  PAWN_SLUG_DEFAULT_KEYMAP,
  PAWN_SLUG_SETTINGS_CACHE_MS,
  invalidatePawnSlugSettingsCache,
  loadPawnSlugSettings,
  savePawnSlugSettings,
} from './pawnSlugControls.js';

const stored = (masterVolume = 0.8, sfxVolume = 0.7) => ({
  masterVolume,
  musicVolume: 0.6,
  sfxVolume,
  expertMode: false,
  keymap: PAWN_SLUG_DEFAULT_KEYMAP,
});

describe('Pawn Slug settings hot-read cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T13:00:00Z'));
    vi.clearAllMocks();
    invalidatePawnSlugSettingsCache();
    vi.mocked(readJsonStorage).mockReturnValue(stored());
  });

  afterEach(() => {
    invalidatePawnSlugSettingsCache();
    vi.useRealTimers();
  });

  it('avoids repeated storage parsing during a burst of sound cues', () => {
    const first = loadPawnSlugSettings();
    const second = loadPawnSlugSettings();
    const third = loadPawnSlugSettings();

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(readJsonStorage).toHaveBeenCalledTimes(1);
  });

  it('refreshes from storage after the short cache window expires', () => {
    expect(loadPawnSlugSettings().sfxVolume).toBe(0.7);
    vi.mocked(readJsonStorage).mockReturnValue(stored(0.5, 0.4));
    vi.advanceTimersByTime(PAWN_SLUG_SETTINGS_CACHE_MS + 1);

    expect(loadPawnSlugSettings().sfxVolume).toBe(0.4);
    expect(readJsonStorage).toHaveBeenCalledTimes(2);
  });

  it('updates the cache immediately when settings are saved', () => {
    loadPawnSlugSettings();
    const saved = savePawnSlugSettings(stored(0.35, 0.25));
    const reloaded = loadPawnSlugSettings();

    expect(setStorageItem).toHaveBeenCalledTimes(1);
    expect(reloaded).toBe(saved);
    expect(reloaded.masterVolume).toBe(0.35);
    expect(reloaded.sfxVolume).toBe(0.25);
    expect(readJsonStorage).toHaveBeenCalledTimes(1);
  });
});
