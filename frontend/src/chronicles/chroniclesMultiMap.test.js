import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsUse } from '../chroniclesOfMatthiasTactics.js';
import {
  chroniclesMapById,
  chroniclesMapIds,
  chroniclesMapTransitionState,
} from './chroniclesMapCatalog.js';

describe('Chronicles multi-map campaign', () => {
  it('registers three standalone authored encounters with distinct content', () => {
    expect(chroniclesMapIds()).toEqual(expect.arrayContaining([
      'crypt-eight-squares',
      'gallery-of-forks',
      'menagerie-of-ash',
    ]));

    const gallery = chroniclesMapById('gallery-of-forks');
    expect(gallery.title).toBe('Galería de las Horquillas');
    expect(gallery.enemies).toHaveLength(2);
    expect(gallery.interactables.map((entry) => entry.id)).toContain('gallery-lever');
    expect(gallery.treasures.map((entry) => entry.id)).toContain('gallery-relic');
    expect(gallery.exits.map((entry) => entry.id)).toContain('gallery-gate');

    const menagerie = chroniclesMapById('menagerie-of-ash');
    const wisp = menagerie.enemies.find((enemy) => enemy.id === 'ember-wisp');
    const gate = menagerie.exits.find((entry) => entry.id === 'menagerie-gate');
    expect(menagerie.version).toBe(3);
    expect(menagerie.enemies).toHaveLength(4);
    expect(wisp).toMatchObject({ optional: true, x: 5, y: 2 });
    expect(menagerie.interactables.map((entry) => entry.id)).toContain('ember-scorchmarks');
    expect(menagerie.treasures.map((entry) => entry.id)).toContain('ember-cache');
    expect(gate.requirements.map((requirement) => requirement.key)).not.toContain('emberWispHp');
  });

  it('crosses the Black Gate into Gallery without resetting the surviving party or journal', () => {
    const initial = createChroniclesState();
    const woundedParty = initial.party.map((member, index) => ({
      ...member,
      hp: Math.max(1, member.hp - index - 1),
    }));
    const readyAtGate = {
      ...initial,
      x: 2,
      y: 1,
      sigilAwake: true,
      jailerHp: 0,
      blackGateKey: true,
      party: woundedParty,
      turns: 23,
      enemyPositions: { stale: { x: 4, y: 4 } },
      journal: [...initial.journal, { id: 'proof', title: 'Proof', body: 'Persist me', sigil: 'P' }],
    };

    const next = chroniclesTacticsUse(readyAtGate, 'black-gate');

    expect(next.mapId).toBe('gallery-of-forks');
    expect({ x: next.x, y: next.y, direction: next.direction }).toEqual({ x: 1, y: 5, direction: 1 });
    expect(next.party).toEqual(woundedParty);
    expect(next.turns).toBe(24);
    expect(next.journal.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      'descent',
      'proof',
      'tactics-black-gate-crossed',
    ]));
    expect(next.enemyHp).toBe(8);
    expect(next.jailerHp).toBe(10);
    expect(next.spectralBishopHp).toBe(0);
    expect(next.scavengerHp).toBe(0);
    expect(next.enemyPositions).toEqual({});
    expect(next.phase).toBe('explore');
  });

  it('crosses Gallery into Menagerie as the third campaign encounter', () => {
    const galleryState = chroniclesMapTransitionState(createChroniclesState(), 'gallery-of-forks');
    const readyToLeave = {
      ...galleryState,
      x: 2,
      y: 1,
      enemyHp: 0,
      jailerHp: 0,
      galleryRelicCollected: true,
      turns: 31,
    };

    const next = chroniclesTacticsUse(readyToLeave, 'gallery-gate');

    expect(next.mapId).toBe('menagerie-of-ash');
    expect({ x: next.x, y: next.y, direction: next.direction }).toEqual({ x: 1, y: 5, direction: 1 });
    expect(next.phase).toBe('explore');
    expect(next.turns).toBe(32);
    expect(next.ashGoblinHp).toBe(5);
    expect(next.cryptSpiderHp).toBe(4);
    expect(next.emberWispHp).toBe(4);
    expect(next.boneHoundHp).toBe(6);
    expect(next.journal.at(-1)?.id).toBe('gallery-menagerie-crossing');
  });

  it('can finish Menagerie while the optional ember side quest remains untouched', () => {
    const menagerieState = chroniclesMapTransitionState(createChroniclesState(), 'menagerie-of-ash');
    const readyToLeave = {
      ...menagerieState,
      x: 4,
      y: 1,
      ashGoblinHp: 0,
      cryptSpiderHp: 0,
      boneHoundHp: 0,
      emberWispHp: 4,
    };

    const escaped = chroniclesTacticsUse(readyToLeave, 'menagerie-gate');

    expect(escaped.mapId).toBe('menagerie-of-ash');
    expect(escaped.phase).toBe('escaped');
    expect(escaped.emberWispHp).toBe(4);
    expect(escaped.inventory).toBeUndefined();
    expect(escaped.quests).toBeUndefined();
    expect(escaped.message).toMatch(/cruza el portón/i);
    expect(escaped.journal.at(-1)?.id).toBe('menagerie-cleared');
  });
});