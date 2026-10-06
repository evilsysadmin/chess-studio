import { describe, expect, it } from 'vitest';
import {
  chroniclesContextualContentAction,
  chroniclesObjective,
  chroniclesReduce,
  createChroniclesState,
} from './chroniclesOfMatthias.js';

function clearedGallery(overrides = {}) {
  return {
    ...createChroniclesState('gallery-of-forks'),
    enemyHp: 0,
    jailerHp: 0,
    ...overrides,
  };
}

describe('Chronicles first-person authored content', () => {
  it('guides the Gallery through lever, relic and only then the exit', () => {
    const beforeLever = clearedGallery();
    expect(chroniclesObjective(beforeLever)).toBe('Bajar contrapeso');

    const afterLever = { ...beforeLever, galleryLeverPulled: true };
    expect(chroniclesObjective(afterLever)).toBe('Recoger reliquia de ceniza');

    const afterRelic = { ...afterLever, galleryRelicCollected: true };
    expect(chroniclesObjective(afterRelic)).toBe('Abrir salida de la galería');
  });

  it('lets first-person activate the Gallery lever and collect the revealed relic', () => {
    const atLever = clearedGallery({ x: 5, y: 5 });
    expect(chroniclesContextualContentAction(atLever)).toMatchObject({
      id: 'gallery-lever',
      kind: 'lever',
      label: 'Bajar contrapeso',
    });

    const leverPulled = chroniclesReduce(atLever, 'interact');
    expect(leverPulled.galleryLeverPulled).toBe(true);
    expect(leverPulled.message).toContain('contrapeso');

    const atRelic = { ...leverPulled, x: 5, y: 4 };
    expect(chroniclesContextualContentAction(atRelic)).toMatchObject({
      id: 'gallery-relic',
      kind: 'pickup',
      label: 'Recoger reliquia de ceniza',
    });

    const collected = chroniclesReduce(atRelic, 'interact');
    expect(collected.galleryRelicCollected).toBe(true);
    expect(chroniclesContextualContentAction(collected)).toBeNull();
    expect(chroniclesObjective(collected)).toBe('Abrir salida de la galería');
  });
  it('does not promote optional Menagerie lore over an already-open exit', () => {
    const state = {
      ...createChroniclesState('menagerie-of-ash'),
      ashGoblinHp: 0,
      cryptSpiderHp: 0,
      boneHoundHp: 0,
    };

    expect(chroniclesObjective(state)).toBe('Cruzar hacia el Archivo del Rey Ciego');
  });


});
