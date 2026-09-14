import { describe, expect, it } from 'vitest';
import { matthiasTimeScene } from './matthiasTime.js';
import { matthiasTimeVisual } from './matthiasVisuals.js';

describe('Matthias campaign dinner Home scene', () => {
  it('mantiene la escena de cena pero evita el asset corrupto', () => {
    const scene = matthiasTimeScene(20);
    expect(scene.key).toBe('lunch-campaign-dinner');
    expect(scene.label).toBe('Cena de campaña');

    const visual = matthiasTimeVisual(20);
    expect(visual.key).toBe('lunch-campaign-dinner');
    expect(visual.avatar).toContain('lunch-bocata');
    expect(visual.avatar).not.toContain('campaign-dinner');
  });
});
