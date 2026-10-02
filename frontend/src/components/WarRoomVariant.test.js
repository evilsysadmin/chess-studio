import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from '../safeStorage.js';
import {
  DEFAULT_WAR_ROOM_VARIANT,
  DEFAULT_WAR_ROOM_VARIANT_PREFERENCE,
  WAR_ROOM_VARIANT_STORAGE_KEY,
  WAR_ROOM_VARIANTS,
  WAR_ROOM_VARIANT_PREFERENCES,
  isClassicWarRoomVariant,
  isWarRoomVariantSelectable,
  loadWarRoomVariant,
  loadWarRoomVariantPreference,
  normalizeWarRoomVariant,
  normalizeWarRoomVariantPreference,
  resolveWarRoomVariantPreference,
  saveWarRoomVariant,
  saveWarRoomVariantPreference,
  warRoomVariantDefinition,
  warRoomVariantDomData,
  warRoomVariantRuntimeModelUrl,
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

  it('uses the classic room as the profile-backed preference by default', () => {
    const options = { env: { VITE_WAR_ROOM_VARIANTS_ENABLE: '1' }, location: { hostname: 'chess-studio.shadowops.dpdns.org' } };
    expect(DEFAULT_WAR_ROOM_VARIANT_PREFERENCE).toBe('classic');
    expect(WAR_ROOM_VARIANT_PREFERENCES.map(({ id }) => id)).toEqual(['random', 'classic', 'v2', 'v3', 'v4']);
    expect(loadWarRoomVariantPreference(options)).toBe('classic');

    expect(saveWarRoomVariantPreference('v3', options)).toBe('v3');
    expect(localStorage.getItem(WAR_ROOM_VARIANT_STORAGE_KEY)).toBe('v3');
    expect(loadWarRoomVariantPreference(options)).toBe('v3');
  });

  it('resolves random once from the available room registry', () => {
    expect(resolveWarRoomVariantPreference('random', { random: () => 0 })).toBe('classic');
    expect(resolveWarRoomVariantPreference('random', { random: () => 0.34 })).toBe('v2');
    expect(resolveWarRoomVariantPreference('random', { random: () => 0.99 })).toBe('v3');
    // v4 is explicit-only while it is validated on device.
    for (const sample of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(resolveWarRoomVariantPreference('random', { random: () => sample })).not.toBe('v4');
    }
    expect(resolveWarRoomVariantPreference('v4')).toBe('v4');
    expect(resolveWarRoomVariantPreference('v2', { random: () => 0.99 })).toBe('v2');
    expect(normalizeWarRoomVariantPreference('basement')).toBe('classic');
  });

  it('defaults to v1 when variants are enabled and nothing was chosen', () => {
    const options = { env: { VITE_WAR_ROOM_VARIANTS_ENABLE: '1' }, location: { hostname: 'chess-studio.shadowops.dpdns.org' } };
    expect(DEFAULT_WAR_ROOM_VARIANT).toBe('classic');
    expect(loadWarRoomVariant(options)).toBe('classic');
    expect(warRoomVariantDefinition(DEFAULT_WAR_ROOM_VARIANT).shell).toBe('procedural');
  });

  it('keeps an explicit choice, including v1 and v3, instead of the default', () => {
    const options = { env: { VITE_WAR_ROOM_VARIANTS_ENABLE: '1' }, location: { hostname: 'chess-studio.shadowops.dpdns.org' } };
    for (const choice of ['classic', 'v3', 'v2']) {
      expect(saveWarRoomVariant(choice, options)).toBe(choice);
      expect(loadWarRoomVariant(options)).toBe(choice);
    }
  });

  it('falls back to the default when the stored value is corrupt', () => {
    const options = { env: { VITE_WAR_ROOM_VARIANTS_ENABLE: '1' }, location: { hostname: 'chess-studio.shadowops.dpdns.org' } };
    localStorage.setItem(WAR_ROOM_VARIANT_STORAGE_KEY, 'war-room-3000');
    expect(loadWarRoomVariant(options)).toBe('classic');
  });

  it('stays on the classic room when variants are not enabled (local dev, plain e2e, rollback)', () => {
    const options = { env: {}, location: { hostname: 'localhost' } };
    expect(isWarRoomVariantSelectable(options)).toBe(false);
    expect(loadWarRoomVariant(options)).toBe('classic');
  });

  it('supports the generic variants flag outside canonical staging', () => {
    const location = { hostname: 'chess-studio.shadowops.dpdns.org' };
    expect(isWarRoomVariantSelectable({
      env: { VITE_WAR_ROOM_VARIANTS_ENABLE: 'true' },
      location,
    })).toBe(true);
  });

  it('keeps shell ownership in the same registry used by the selector', () => {
    expect(WAR_ROOM_VARIANTS.map(({ id }) => id)).toEqual(['classic', 'v2', 'v3', 'v4']);
    expect(warRoomVariantDefinition('v4').shell).toBe('blender');
    expect(warRoomVariantRuntimeModelUrl('v4', { buildSha: 'abc123' }))
      .toBe('https://assets.chess-studio.shadowops.dpdns.org/war-room/v4/runtime/current.glb?build=abc123');
    expect(warRoomVariantDefinition('classic').shell).toBe('procedural');
    expect(warRoomVariantDefinition('v2').shell).toBe('blender');
    expect(warRoomVariantDefinition('v3').shell).toBe('blender');
    expect(isClassicWarRoomVariant({ selectable: true, variant: 'classic' })).toBe(true);
    expect(isClassicWarRoomVariant({ selectable: true, variant: 'v2' })).toBe(false);
    expect(isClassicWarRoomVariant({ selectable: false, variant: 'v3' })).toBe(true);
  });

  it('owns cacheable runtime model URLs before the scene mounts', () => {
    expect(warRoomVariantRuntimeModelUrl('v2', { buildSha: 'abc123' }))
      .toBe('https://assets.chess-studio.shadowops.dpdns.org/war-room/v2/runtime/current.glb?build=abc123');
    expect(warRoomVariantRuntimeModelUrl('v3', { buildSha: 'abc123' }))
      .toBe('https://assets.chess-studio.shadowops.dpdns.org/war-room/v3/runtime/current.glb?build=abc123');
    expect(warRoomVariantRuntimeModelUrl('duel', { buildSha: 'abc123' }))
      .toBe('https://assets.chess-studio.shadowops.dpdns.org/pvp/duel-room/runtime/pvp-duel-room-shell-bc8849ca70350d00.glb?build=abc123');
    expect(warRoomVariantRuntimeModelUrl('classic', { buildSha: 'abc123' })).toBeNull();
  });

  it('owns generic DOM diagnostics in the variant layer', () => {
    expect(warRoomVariantDomData('v3', 'loading')).toEqual({
      'data-board3d-variant': 'v3',
      'data-board3d-variant-status': 'loading',
    });
  });

  it('normalizes unknown variants back to the classic room', () => {
    expect(normalizeWarRoomVariant('war-room-3000')).toBe('classic');
    expect(warRoomVariantDefinition('war-room-3000').id).toBe('classic');
  });
});
