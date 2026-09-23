import { beforeEach, describe, expect, it } from 'vitest';
import { CLASS_ROOM_VARIANT_STORAGE_KEY, loadClassRoomVariant, saveClassRoomVariant } from './ClassRoomVariant.js';

const ENABLED = { env: { VITE_WAR_ROOM_VARIANTS_ENABLE: 'true' }, location: { hostname: 'localhost' } };
const DISABLED = { env: {}, location: { hostname: 'localhost' } };

describe('Class Room scene variant', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts on War Room v1 independently of the global War Room preference', () => {
    localStorage.setItem('chess-study-war-room-variant-v1', 'v2');
    expect(loadClassRoomVariant(ENABLED)).toBe('classic');
  });

  it('persists its own v2/v3 choice without touching the global War Room preference', () => {
    localStorage.setItem('chess-study-war-room-variant-v1', 'v2');
    expect(saveClassRoomVariant('v3', ENABLED)).toBe('v3');
    expect(loadClassRoomVariant(ENABLED)).toBe('v3');
    expect(localStorage.getItem(CLASS_ROOM_VARIANT_STORAGE_KEY)).toBe('v3');
    expect(localStorage.getItem('chess-study-war-room-variant-v1')).toBe('v2');
  });

  it('falls back to v1 when variants are not enabled', () => {
    localStorage.setItem(CLASS_ROOM_VARIANT_STORAGE_KEY, 'v3');
    expect(loadClassRoomVariant(DISABLED)).toBe('classic');
    expect(saveClassRoomVariant('v2', DISABLED)).toBe('classic');
  });
});
