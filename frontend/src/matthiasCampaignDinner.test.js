import { describe, expect, it } from 'vitest';
import { matthiasTimeScene } from './matthiasTime.js';
import { matthiasTimeVisual } from './matthiasVisuals.js';

describe('Matthias campaign dinner Home scene', () => {
  it('las 20:00 usan una escena propia y no reciclan el bocata del mediodía', () => {
    const scene = matthiasTimeScene(20);
    expect(scene.key).toBe('campaign-dinner');
    expect(scene.label).toBe('Cena de campaña');

    const visual = matthiasTimeVisual(20);
    expect(visual.key).toBe('campaign-dinner');
    expect(visual.avatar).toContain('campaign-dinner');
  });
});
