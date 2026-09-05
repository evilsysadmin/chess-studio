import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_LOCAL,
  removeStorageItem,
  setStorageItem,
} from '../safeStorage.js';
import {
  BOARD_RENDERER_STORAGE_KEY,
  shouldPrewarmBoard3D,
} from './board3DPrewarm.js';

describe('Board3D idle prewarm policy', () => {
  beforeEach(() => {
    removeStorageItem(STORAGE_LOCAL, BOARD_RENDERER_STORAGE_KEY);
  });

  it('prewarms 3D when no explicit renderer preference exists', () => {
    expect(shouldPrewarmBoard3D()).toBe(true);
  });

  it('prewarms 3D for the explicit 3D preference', () => {
    setStorageItem(STORAGE_LOCAL, BOARD_RENDERER_STORAGE_KEY, '3d');
    expect(shouldPrewarmBoard3D()).toBe(true);
  });

  it('does not prewarm Board3D after the user explicitly chooses 2D', () => {
    setStorageItem(STORAGE_LOCAL, BOARD_RENDERER_STORAGE_KEY, '2d');
    expect(shouldPrewarmBoard3D()).toBe(false);
  });
});
