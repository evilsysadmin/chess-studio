import { describe, expect, it } from 'vitest';
import {
  threeSurfaceNeedsContinuousRender,
  threeSurfaceShouldRender,
} from './threeRenderPolicy.js';

describe('threeSurfaceShouldRender', () => {
  it('renders only while the document and surface are active and visible', () => {
    expect(threeSurfaceShouldRender()).toBe(true);
    expect(threeSurfaceShouldRender({ documentHidden: true })).toBe(false);
    expect(threeSurfaceShouldRender({ intersecting: false })).toBe(false);
    expect(threeSurfaceShouldRender({ paused: true })).toBe(false);
  });
});

describe('threeSurfaceNeedsContinuousRender', () => {
  it('keeps animated surfaces continuous unless reduced motion is requested', () => {
    expect(threeSurfaceNeedsContinuousRender()).toBe(true);
    expect(threeSurfaceNeedsContinuousRender({ reducedMotion: true })).toBe(false);
    expect(threeSurfaceNeedsContinuousRender({ animated: false })).toBe(false);
  });
});
