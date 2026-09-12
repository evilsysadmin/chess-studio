import { describe, expect, it } from 'vitest';
import { createPawnSlugTouchActionOwners } from './pawnSlugTouchActionOwners.js';

describe('Pawn Slug touch action ownership', () => {
  it('keeps an action pressed until its last pointer releases it', () => {
    const owners = createPawnSlugTouchActionOwners();

    expect(owners.acquire('right', 1)).toBe(true);
    expect(owners.acquire('right', 2)).toBe(false);
    expect(owners.has('right')).toBe(true);
    expect(owners.release('right', 1)).toBe(false);
    expect(owners.has('right')).toBe(true);
    expect(owners.release('right', 2)).toBe(true);
    expect(owners.has('right')).toBe(false);
  });

  it('does not double-count the same pointer and ignores unknown releases', () => {
    const owners = createPawnSlugTouchActionOwners();

    expect(owners.acquire('fire', 7)).toBe(true);
    expect(owners.acquire('fire', 7)).toBe(false);
    expect(owners.release('fire', 99)).toBe(false);
    expect(owners.release('fire', 7)).toBe(true);
  });

  it('returns every still-held action once during cleanup', () => {
    const owners = createPawnSlugTouchActionOwners();
    owners.acquire('left', 1);
    owners.acquire('left', 2);
    owners.acquire('fire', 3);

    expect(owners.clear().sort()).toEqual(['fire', 'left']);
    expect(owners.has('left')).toBe(false);
    expect(owners.has('fire')).toBe(false);
  });
});
