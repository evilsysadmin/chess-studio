import { describe, expect, it } from 'vitest';
import { chroniclesIsoScenePalette } from '../chroniclesOfMatthiasIsometric.js';
import { chroniclesIsometricSceneStyle } from './chroniclesIsometricSceneStyles.js';

describe('Chronicles isometric renderer palette', () => {
  it('consumes a complete palette from the authored scene plan', () => {
    const gallery = chroniclesIsometricSceneStyle('gallery-of-forks').palette;
    expect(chroniclesIsoScenePalette({ sceneStyle: { palette: gallery } })).toBe(gallery);
  });

  it('falls back to the neutral palette when scene styling is absent or incomplete', () => {
    const fallback = chroniclesIsometricSceneStyle().palette;
    expect(chroniclesIsoScenePalette(null)).toBe(fallback);
    expect(chroniclesIsoScenePalette({ sceneStyle: { palette: { floor: [], wall: [] } } })).toBe(fallback);
  });
});
