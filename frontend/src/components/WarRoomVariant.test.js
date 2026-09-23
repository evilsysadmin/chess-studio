import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from '../safeStorage.js';
import {
  WAR_ROOM_VARIANT_STORAGE_KEY,
  WAR_ROOM_VARIANTS,
  isClassicWarRoomVariant,
  isWarRoomVariantSelectable,
  loadWarRoomVariant,
  normalizeWarRoomVariant,
  saveWarRoomVariant,
  warRoomVariantDefinition,
  warRoomVariantDomData,
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

  it('enables the selector on canonical staging and persists Blender variants safely', () => {
    const options = {
      env: { VITE_API_URL: 'https://api-staging.chess-studio.shadowops.dpdns.org/api' },
      location: { hostname: 'staging.chess-studio.shadowops.dpdns.org' },
    };
    expect(isWarRoomVariantSelectable(options)).toBe(true);
    expect(saveWarRoomVariant('v2', options)).toBe('v2');
    expect(loadWarRoomVariant(options)).toBe('v2');
    expect(saveWarRoomVariant('v3', options)).toBe('v3');
    expect(loadWarRoomVariant(options)).toBe('v3');
  });

  it('supports the generic variants flag while retaining the v2 flag as a compatibility alias', () => {
    const location = { hostname: 'chess-studio.shadowops.dpdns.org' };
    expect(isWarRoomVariantSelectable({
      env: { VITE_WAR_ROOM_VARIANTS_ENABLE: 'true' },
      location,
    })).toBe(true);
    expect(isWarRoomVariantSelectable({
      env: { VITE_WAR_ROOM_V2_ENABLE: '1' },
      location,
    })).toBe(true);
  });

  it('keeps shell ownership in the same registry used by the selector', () => {
    expect(WAR_ROOM_VARIANTS.map(({ id }) => id)).toEqual(['classic', 'v2', 'v3']);
    expect(warRoomVariantDefinition('classic').shell).toBe('procedural');
    expect(warRoomVariantDefinition('v2').shell).toBe('blender');
    expect(warRoomVariantDefinition('v3').shell).toBe('blender');
    expect(isClassicWarRoomVariant({ selectable: true, variant: 'classic' })).toBe(true);
    expect(isClassicWarRoomVariant({ selectable: true, variant: 'v2' })).toBe(false);
    expect(isClassicWarRoomVariant({ selectable: false, variant: 'v3' })).toBe(true);
  });

  it('owns generic and compatibility DOM diagnostics in the variant layer', () => {
    expect(warRoomVariantDomData('v3', 'loading')).toEqual({
      'data-board3d-variant': 'v3',
      'data-board3d-variant-status': 'loading',
      'data-board3d-v2-status': 'loading',
    });
  });

  it('normalizes unknown variants back to the classic room', () => {
    expect(normalizeWarRoomVariant('war-room-3000')).toBe('classic');
    expect(warRoomVariantDefinition('war-room-3000').id).toBe('classic');
  });
});
