import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from '../safeStorage.js';
import {
  WAR_ROOM_VARIANT_STORAGE_KEY,
  isWarRoomVariantSelectable,
  loadWarRoomVariant,
  normalizeWarRoomVariant,
  saveWarRoomVariant,
} from './WarRoomVariant.js';

describe('War Room staging variant', () => {
  beforeEach(() => {
    clearStorageMemoryFallback();
    localStorage.clear();
  });

  it('stays classic outside staging even if a stale v2 preference exists', () => {
    localStorage.setItem(WAR_ROOM_VARIANT_STORAGE_KEY, 'v2');
    const options = {
      env: { VITE_API_URL: 'https://api.chess-studio.shadowops.dpdns.org/api' },
      location: { hostname: 'chess-studio.shadowops.dpdns.org' },
    };
    expect(isWarRoomVariantSelectable(options)).toBe(false);
    expect(loadWarRoomVariant(options)).toBe('classic');
  });

  it('enables the selector on canonical staging and persists v2 safely', () => {
    const options = {
      env: { VITE_API_URL: 'https://api-staging.chess-studio.shadowops.dpdns.org/api' },
      location: { hostname: 'staging.chess-studio.shadowops.dpdns.org' },
    };
    expect(isWarRoomVariantSelectable(options)).toBe(true);
    expect(saveWarRoomVariant('v2', options)).toBe('v2');
    expect(loadWarRoomVariant(options)).toBe('v2');
  });

  it('normalizes unknown variants back to the classic room', () => {
    expect(normalizeWarRoomVariant('war-room-3000')).toBe('classic');
  });
});
