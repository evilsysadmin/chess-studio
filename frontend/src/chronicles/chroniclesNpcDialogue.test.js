import { describe, expect, it } from 'vitest';
import { chroniclesContextualContentAction, chroniclesReduce, createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesNpcDialogueForState } from './chroniclesNpcDialogue.js';
import { chroniclesMapById } from './chroniclesMapCatalog.js';

const at = (x, y) => ({ ...createChroniclesState('swordhaven-first-book'), x, y });

describe('Chronicles NPC dialogue · MM3 audience', () => {
  it('opens the mayor at authored internal (11,10), HUD (11,4), with numbered topics and one real quest action', () => {
    const state = at(11, 10);
    const contextual = chroniclesContextualContentAction(state);
    expect(contextual?.id).toBe('swordhaven-mayor');
    const audience = chroniclesNpcDialogueForState(state, contextual);
    expect(audience).toMatchObject({ name: 'Alcalde Aldric', room: 'aldric-hall' });
    expect(audience.choices.map((choice) => choice.kind)).toEqual(['say', 'say', 'action', 'leave']);
    expect(audience.choices[2].actionId).toBe('swordhaven-mayor');
    expect(audience.choices[0].answer).toMatch(/caballeros|Dama/);
    expect(chroniclesMapById(state.mapId).grid).toHaveLength(15);
  });

  it('never grants rewards when merely opening a dialogue; talk uses the campaign reducer', () => {
    const before = at(11, 10);
    const audience = chroniclesNpcDialogueForState(before, chroniclesContextualContentAction(before));
    expect(audience).not.toBeNull();
    expect(before.swordhavenMayorMet).toBeFalsy();
    expect(before.inventory?.['sewer-key']).toBeUndefined();
    const after = chroniclesReduce(before, 'interact');
    expect(after.swordhavenMayorMet).toBe(true);
    expect(after.inventory['sewer-key'].quantity).toBe(1);
    const second = chroniclesNpcDialogueForState(after, chroniclesContextualContentAction(after));
    expect(second.choices.filter((choice) => choice.kind === 'action')).toHaveLength(1);
    expect(second.choices.find((choice) => choice.kind === 'action')?.actionId).toBe('swordhaven-mayor-sewers');
  });

  it('keeps NPCs available after one-time dialogue branches have finished', () => {
    const state = at(11, 10);
    const resolved = { ...state, swordhavenMayorMet: true, swordhavenSewersReported: true, swordhavenRouteReported: true };
    const dialogue = chroniclesNpcDialogueForState(resolved, chroniclesContextualContentAction(resolved));
    expect(dialogue.name).toBe('Alcalde Aldric');
    expect(dialogue.choices.map((choice) => choice.kind)).toEqual(['say', 'say', 'leave']);
  });

  it('uses the same numbered model for other authored town NPCs', () => {
    for (const [x, y, name] of [[4, 6, 'Sargento Brask'], [14, 6, 'Sacerdotisa Ilse']]) {
      const state = at(x, y);
      const dialogue = chroniclesNpcDialogueForState(state, chroniclesContextualContentAction(state));
      expect(dialogue.name).toBe(name);
      expect(dialogue.choices.filter((choice) => choice.kind === 'say')).toHaveLength(2);
      expect(dialogue.choices.at(-1)).toMatchObject({ kind: 'leave' });
    }
  });

  it('never intercepts merchants, guilds or open street tiles', () => {
    const town = chroniclesMapById('swordhaven-first-book');
    const merchant = town.interactables.find((entry) => entry.shop);
    const guild = town.interactables.find((entry) => entry.guild);
    expect(chroniclesNpcDialogueForState(at(merchant.x, merchant.y))).toBeNull();
    expect(chroniclesNpcDialogueForState(at(guild.x, guild.y))).toBeNull();
    expect(chroniclesNpcDialogueForState(at(9, 7))).toBeNull();
  });
});
