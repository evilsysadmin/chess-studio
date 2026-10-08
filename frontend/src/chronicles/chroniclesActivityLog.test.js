import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import {
  chroniclesActivityEvents,
  chroniclesAppendActivityLog,
} from './chroniclesActivityLog.js';
import { chroniclesMapForState } from './chroniclesMapCatalog.js';

describe('Chronicles activity log projection', () => {
  it('records a real enemy attack with target and HP loss', () => {
    const previous = {
      ...createChroniclesState(),
      phase: 'combat',
      initiative: {
        version: 1,
        die: '1d8',
        round: 2,
        cursor: 0,
        order: [{ id: 'corrupted-pawn', kind: 'enemy', name: 'Peón', agility: 0, roll: 4, initiative: 4 }],
      },
      enemyTurnEvents: [],
    };
    const next = {
      ...previous,
      party: previous.party.map((member) => (
        member.id === 'matthias' ? { ...member, hp: member.hp - 1 } : member
      )),
      enemyTurnEvents: [{
        type: 'attack',
        enemyId: 'corrupted-pawn',
        targetId: 'matthias',
        damage: 1,
        fromHp: 7,
        toHp: 6,
      }],
    };

    const events = chroniclesActivityEvents(previous, next);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'enemy-attack',
        text: expect.stringMatching(/golpea a Matthias.*-1 HP/i),
      }),
    ]));
  });

  it('records player damage against enemies and authored expedition journal events', () => {
    const previous = {
      ...createChroniclesState(),
      phase: 'combat',
      initiative: {
        version: 1,
        die: '1d8',
        round: 1,
        cursor: 0,
        order: [{ id: 'matthias', kind: 'party', name: 'Matthias', agility: 0, roll: 5, initiative: 5 }],
      },
      enemyTurnEvents: [],
      journal: [],
    };
    const next = {
      ...previous,
      enemyHp: Number(previous.enemyHp) - 2,
      journal: [{
        id: 'door-opened',
        title: 'La puerta cede',
        body: 'El cerrojo se abre y la compañía continúa.',
        sigil: 'I',
      }],
    };

    const events = chroniclesActivityEvents(previous, next);
    expect(events.some((entry) => entry.kind === 'party-attack' && /Matthias golpea.*-2 HP/i.test(entry.text))).toBe(true);
    expect(events.some((entry) => entry.kind === 'expedition' && /La puerta cede/i.test(entry.text))).toBe(true);
  });

  it('logs combat entry once instead of duplicating the initiative message', () => {
    const previous = createChroniclesState();
    const next = {
      ...previous,
      phase: 'combat',
      message: 'Combate por turnos · iniciativa = AGI + 1d8: Matthias 8 · Peón 6.',
      initiative: {
        version: 1,
        die: '1d8',
        round: 1,
        cursor: 0,
        order: [
          { id: 'matthias', kind: 'party', name: 'Matthias', agility: 0, roll: 8, initiative: 8 },
          { id: 'corrupted-pawn', kind: 'enemy', name: 'Peón', agility: 0, roll: 6, initiative: 6 },
        ],
      },
    };

    const events = chroniclesActivityEvents(previous, next);
    expect(events.filter((entry) => entry.kind === 'combat')).toHaveLength(1);
    expect(events.filter((entry) => entry.kind === 'turn')).toHaveLength(0);
  });

  it('does not replay the map initial journal when the first authored entry is appended', () => {
    const previous = createChroniclesState();
    const initialJournal = chroniclesMapForState(previous).initialJournal;
    const next = {
      ...previous,
      journal: [
        initialJournal,
        {
          id: 'lever-opened',
          title: 'La palanca cede',
          body: 'Un mecanismo despierta detrás del muro.',
          sigil: 'II',
        },
      ],
    };

    const events = chroniclesActivityEvents(previous, next);
    expect(events.some((entry) => /La palanca cede/i.test(entry.text))).toBe(true);
    expect(events.some((entry) => entry.text.includes(initialJournal.title))).toBe(false);
  });


  it('does not spam ordinary exploration locomotion into the log', () => {
    const previous = createChroniclesState();
    const next = {
      ...previous,
      y: previous.y - 1,
      turns: previous.turns + 1,
      message: 'La compañía avanza hacia norte.',
    };

    expect(chroniclesActivityEvents(previous, next)).toEqual([]);
  });

  it('keeps only the bounded tail of the activity buffer', () => {
    const current = Array.from({ length: 4 }, (_, index) => ({ id: `old-${index}` }));
    const incoming = [{ id: 'new-a' }, { id: 'new-b' }];

    expect(chroniclesAppendActivityLog(current, incoming, 3).map((entry) => entry.id)).toEqual([
      'old-3',
      'new-a',
      'new-b',
    ]);
  });
});
