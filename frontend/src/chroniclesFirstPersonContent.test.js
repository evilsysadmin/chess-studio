import { describe, expect, it } from 'vitest';
import { chroniclesFirstPersonScenePlan } from './chronicles/chroniclesFirstPersonScenePlan.js';
import { chroniclesApplyContentEffects } from './chronicles/chroniclesContentRuntime.js';
import { chroniclesNpcDialogueForState } from './chronicles/chroniclesNpcDialogue.js';
import { CHRONICLES_SWORDHAVEN_RETURN_PORTAL_ID } from './chronicles/chroniclesSwordhavenReturnPortal.js';
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

describe('Swordhaven town entrances remain reachable in first person', () => {
  const at = (x, y, direction) => ({ ...createChroniclesState('swordhaven-first-book'), x, y, direction });

  it('opens the weaponsmith from the street even with the sealed letter on the current tile; buys from that counter', () => {
    const before = at(7, 5, 0);
    expect(chroniclesContextualContentAction(before)?.id).toBe('first-book-weaponsmith');
    const counter = chroniclesReduce(before, 'interact');
    expect(counter.shop?.id).toBe('first-book-weaponsmith');
    const bought = chroniclesReduce({ ...counter, inventory: { ...counter.inventory, 'crown-gold': { quantity: 200 } } },
      { type: 'shop-buy', itemId: 'wooden-staff' });
    expect(bought.inventory['wooden-staff']?.quantity).toBe(1);
  });

  it('opens the armorer and guild when directly facing their entrance; guild membership works from the same tile', () => {
    const armorer = at(11, 5, 0);
    expect(chroniclesContextualContentAction(armorer)?.id).toBe('first-book-armorer');
    expect(chroniclesReduce(armorer, 'interact').shop?.id).toBe('first-book-armorer');
    const guild = at(15, 5, 0);
    expect(chroniclesContextualContentAction(guild)?.id).toBe('first-book-guild');
    const counter = chroniclesReduce(guild, 'interact');
    expect(counter.guild?.id).toBe('first-book-guild');
    const joined = chroniclesReduce({ ...counter, inventory: { ...counter.inventory, 'crown-gold': { quantity: 20 } } },
      { type: 'guild-join' });
    expect(joined.guildMemberships?.['first-book-guild']).toBe(true);
  });

  it('lets the party speak to Aldric, Brask and Ilse while facing the entry tile', () => {
    for (const [x, y, direction, id, name] of [
      [11, 9, 2, 'swordhaven-mayor', 'Alcalde Aldric'],
      [4, 5, 2, 'first-book-watch-house', 'Sargento Brask'],
      [14, 5, 2, 'first-book-temple', 'Sacerdotisa Ilse'],
    ]) {
      const before = at(x, y, direction);
      expect(chroniclesContextualContentAction(before)?.id).toBe(id);
      expect(chroniclesNpcDialogueForState(before, chroniclesContextualContentAction(before))?.name).toBe(name);
    }
  });

  it('keeps the mayor available to talk even after all one-shot quest actions have expired', () => {
    const finished = {
      ...at(11, 9, 2),
      swordhavenMayorMet: true, swordhavenSewersReported: true, swordhavenRouteReported: true,
    };
    const npc = chroniclesNpcDialogueForState(finished, chroniclesContextualContentAction(finished));
    expect(npc?.name).toBe('Alcalde Aldric');
    expect(npc.choices.map((choice) => choice.kind)).toEqual(['say', 'say', 'leave']);
  });

  it('preserves locked inn pricing and never opens a distant or wrong-facing counter', () => {
    const before = at(7, 9, 2);
    expect(chroniclesContextualContentAction(before)).toMatchObject({ id: 'first-book-healer', locked: true });
    expect(chroniclesReduce(before, 'interact').message).toMatch(/crédito|oro|monedas/i);
    expect(chroniclesContextualContentAction(at(7, 8, 2))).toBeNull();
    expect(chroniclesContextualContentAction(at(11, 5, 1))).toBeNull();
  });
});

describe('Swordhaven return portal without altering legacy crypt maps', () => {
  it('creates a genuine contextual door at the crypt entry only after arriving from Swordhaven', () => {
    const fromTown = createChroniclesState('swordhaven-square');
    const inCrypt = chroniclesApplyContentEffects(fromTown, [
      { type: 'transition-map', mapId: 'crypt-eight-squares' },
    ]);
    expect(inCrypt.swordhavenArrived).toBe(true);
    expect(chroniclesContextualContentAction(inCrypt)).toMatchObject({
      id: CHRONICLES_SWORDHAVEN_RETURN_PORTAL_ID,
      label: 'Regresar a Swordhaven',
    });
    expect(chroniclesFirstPersonScenePlan(inCrypt).content).toEqual(
      expect.arrayContaining([expect.objectContaining({
        id: CHRONICLES_SWORDHAVEN_RETURN_PORTAL_ID,
        kind: 'exit',
        position: { x: 1, y: 5 },
      })]),
    );
    const home = chroniclesReduce(inCrypt, 'interact');
    expect(home.mapId).toBe('swordhaven-square');
    expect({ x: home.x, y: home.y }).toEqual({ x: 9, y: 17 });
    expect(home.swordhavenArrived).toBe(true);
    expect(home.phase).toBe('explore');
    expect(home.turns).toBe(inCrypt.turns + 1);
  });

  it('does not offer a town return to legacy crypt-only saves', () => {
    const legacy = createChroniclesState('crypt-eight-squares');
    expect(chroniclesContextualContentAction(legacy)).toBeNull();
    expect(chroniclesFirstPersonScenePlan(legacy).content.some(
      (entry) => entry.id === CHRONICLES_SWORDHAVEN_RETURN_PORTAL_ID,
    )).toBe(false);
  });

  it('requires standing at the entrance and being outside combat', () => {
    const visited = chroniclesApplyContentEffects(createChroniclesState('swordhaven-square'), [
      { type: 'transition-map', mapId: 'crypt-eight-squares' },
    ]);
    expect(chroniclesContextualContentAction({ ...visited, x: 2 })).toBeNull();
    expect(chroniclesContextualContentAction({ ...visited, initiative: { round: 1 } })).toBeNull();
    expect(chroniclesContextualContentAction({ ...visited, phase: 'defeated' })).toBeNull();
  });
});
