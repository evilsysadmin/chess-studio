import { describe, expect, it } from 'vitest';
import { homeBlenderShouldRender } from './HomeBlenderScene3D.jsx';

describe('Blender Home visibility policy', () => {
  it('renders only when the page and the scene are both visible', () => {
    expect(homeBlenderShouldRender()).toBe(true);
    expect(homeBlenderShouldRender({ documentHidden: false, intersecting: true })).toBe(true);
    expect(homeBlenderShouldRender({ documentHidden: true, intersecting: true })).toBe(false);
    expect(homeBlenderShouldRender({ documentHidden: false, intersecting: false })).toBe(false);
    expect(homeBlenderShouldRender({ documentHidden: true, intersecting: false })).toBe(false);
  });
});
