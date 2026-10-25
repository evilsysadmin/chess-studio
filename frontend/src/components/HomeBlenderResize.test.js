import { describe, expect, it } from 'vitest';
import { homeBlenderViewportChanged } from './HomeBlenderScene3D.jsx';

describe('Home Blender resize deduplication', () => {
  const portrait = Object.freeze({ width: 390, height: 844, pixelRatio: 1.25, lod: 'lite' });

  it('applies initial allocation but ignores repeat ResizeObserver/window events', () => {
    expect(homeBlenderViewportChanged(null, portrait)).toBe(true);
    expect(homeBlenderViewportChanged(portrait, { ...portrait })).toBe(false);
    expect(homeBlenderViewportChanged(portrait, portrait)).toBe(false);
  });

  it('reconfigures on real mobile rotation and layout changes', () => {
    expect(homeBlenderViewportChanged(portrait, { ...portrait, width: 844, height: 390 })).toBe(true);
    expect(homeBlenderViewportChanged(portrait, { ...portrait, height: 845 })).toBe(true);
  });

  it('responds to actual DPI or LOD changes even with identical CSS dimensions', () => {
    expect(homeBlenderViewportChanged(portrait, { ...portrait, pixelRatio: 1 })).toBe(true);
    expect(homeBlenderViewportChanged(portrait, { ...portrait, lod: 'full' })).toBe(true);
  });

  it('does not mutate viewport objects supplied by the observer', () => {
    const next = Object.freeze({ ...portrait });
    expect(homeBlenderViewportChanged(portrait, next)).toBe(false);
    expect(next).toEqual(portrait);
  });
});
