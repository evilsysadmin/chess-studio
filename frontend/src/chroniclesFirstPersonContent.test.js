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
  it('crosses the Swordhaven south gate into a real explorable crypt, not a terminal victory', () => {
    const atTown = createChroniclesState('swordhaven-square');
    expect(atTown.phase).toBe('explore');
    expect(atTown.swordhavenArrived).toBe(true);
    // The canonical spawn faces north; stepping backward reaches the south gate.
    const crossed = chroniclesReduce(atTown, 'backward');
    expect(crossed.mapId).toBe('crypt-eight-squares');
    expect(crossed.phase).toBe('explore');
    expect({ x: crossed.x, y: crossed.y }).toEqual({ x: 1, y: 5 });
    expect(crossed.swordhavenArrived).toBe(true);
    expect(crossed.turns).toBeGreaterThan(atTown.turns);
  });


  it('guides the Gallery through lever, relic and only then the exit', () => {
    const beforeLever = clearedGallery();
    expect(chroniclesObjective(beforeLever)).toBe('Bajar contrapeso');

    const afterLever = { ...beforeLever, galleryLeverPulled: true };
    expect(chroniclesObjective(afterLever)).toBe('Recoger reliquia de ceniza');

    const afterRelic = { ...afterLever, galleryRelicCollected: true };
    expect(chroniclesObjective(afterRelic)).toBe('Abrir salida de la galería');
  });

  it('lets first-person use a reachable front-cell mechanism before stepping onto its tile', () => {
    const beforeLever = clearedGallery({ x: 4, y: 5, direction: 1 });

    expect(chroniclesContextualContentAction(beforeLever)).toMatchObject({
      id: 'gallery-lever',
      kind: 'lever',
      label: 'Bajar contrapeso',
    });

    const pulled = chroniclesReduce(beforeLever, 'interact');
    expect(pulled.galleryLeverPulled).toBe(true);
    expect(pulled.x).toBe(4);
    expect(pulled.y).toBe(5);
  });

  it('requires the mechanism tile to be both in front and legally walkable', () => {
    const wrongFacing = clearedGallery({ x: 4, y: 5, direction: 3 });
    expect(chroniclesContextualContentAction(wrongFacing)).toBeNull();

    const blocked = clearedGallery({
      x: 4,
      y: 5,
      direction: 1,
      enemyHp: 3,
      enemyPositions: { 'fork-stalker': { x: 5, y: 5 } },
    });
    expect(chroniclesContextualContentAction(blocked)).toBeNull();
  });

  it('does not extend front-cell reach to pickups', () => {
    const beforeRelic = clearedGallery({
      x: 5,
      y: 5,
      direction: 0,
      galleryLeverPulled: true,
    });
    expect(chroniclesContextualContentAction(beforeRelic)).toBeNull();

    const onRelic = { ...beforeRelic, x: 5, y: 4 };
    expect(chroniclesContextualContentAction(onRelic)).toMatchObject({
      id: 'gallery-relic',
      kind: 'pickup',
    });
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
