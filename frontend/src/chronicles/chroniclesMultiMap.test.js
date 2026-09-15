import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsUse } from '../chroniclesOfMatthiasTactics.js';
import {
  chroniclesMapById,
  chroniclesMapIds,
  chroniclesMapTransitionState,
} from './chroniclesMapCatalog.js';

describe('Chronicles multi-map campaign', () => {
  it('registers a second standalone encounter with its own state and content', () => {
    expect(chroniclesMapIds()).toEqual(expect.arrayContaining([
      'crypt-eight-squares',
      'gallery-of-forks',
    ]));

    const gallery = chroniclesMapById('gallery-of-forks');
    expect(gallery.title).toBe('Galería de las Horquillas');
    expect(gallery.enemies).toHaveLength(2);
    expect(gallery.interactables.map((entry) => entry.id)).toContain('gallery-lever');
    expect(gallery.treasures.map((entry) => entry.id)).toContain('gallery-relic');
    expect(gallery.exits.map((entry) => entry.id)).toContain('gallery-gate');
  });

  it('crosses the Black Gate into the second map without resetting the surviving party or journal', () => {
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

  it('can finish the second encounter through its own declarative exit', () => {
    const galleryState = chroniclesMapTransitionState(createChroniclesState(), 'gallery-of-forks');
    const readyToLeave = {
      ...galleryState,
      x: 2,
      y: 1,
      enemyHp: 0,
      jailerHp: 0,
      galleryRelicCollected: true,
    };

    const escaped = chroniclesTacticsUse(readyToLeave, 'gallery-gate');
    expect(escaped.mapId).toBe('gallery-of-forks');
    expect(escaped.phase).toBe('escaped');
    expect(escaped.message).toMatch(/abandona la Galería/);
    expect(escaped.journal.at(-1)?.id).toBe('gallery-extraction');
  });
});
