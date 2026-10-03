import { afterEach, describe, expect, it } from 'vitest';
import {
  chroniclesClearRuntimeMapDefinitions,
  chroniclesMapById,
  chroniclesValidateMapDefinition,
} from './chronicles/chroniclesMapCatalog.js';
import {
  chroniclesObjective,
  chroniclesReduce,
  createChroniclesState,
} from './chroniclesOfMatthias.js';
import { chroniclesApplyRunCheckpoint } from './chronicles/chroniclesRunCheckpoint.js';

afterEach(() => {
  chroniclesClearRuntimeMapDefinitions();
});

describe('Chronicles runtime difficulty / defeat regressions', () => {
  it('does not stack EnemyBuild modifiers when a validated map is normalized again', () => {
    const normalized = chroniclesMapById('blind-king-archive');
    const first = normalized.enemies.find((enemy) => enemy.id === 'ledger-warden');
    expect(first).toMatchObject({ maxHp: 9, retaliation: 2 });

    const roundTrip = chroniclesValidateMapDefinition(JSON.parse(JSON.stringify(normalized)));
    const second = roundTrip.enemies.find((enemy) => enemy.id === 'ledger-warden');
    expect(second).toMatchObject({ maxHp: 9, retaliation: 2 });
  });

  it('ends first-person Chronicles immediately when retaliation wipes the party', () => {
    let state = chroniclesReduce(createChroniclesState(), 'forward');
    state = {
      ...state,
      party: state.party.map((member) => ({
        ...member,
        hp: member.id === 'rook' ? 1 : 0,
      })),
    };

    state = chroniclesReduce(state, { type: 'attack', memberId: 'rook' });

    expect(state.phase).toBe('defeated');
    expect(chroniclesObjective(state)).toBe('La expedición ha caído');

    const frozen = chroniclesReduce(state, 'backward');
    expect(frozen).toBe(state);
    expect([frozen.x, frozen.y]).toEqual([2, 5]);
  });

  it('repairs an old checkpoint that persisted a full wipe as explore', () => {
    const base = createChroniclesState();
    const worldFlags = {
      '__chrRuntime.version': 1,
      '__chrRuntime.phase': 'explore',
      ...Object.fromEntries(base.party.map((member) => [
        `__chrRuntime.party.${member.id}.hp`,
        0,
      ])),
    };

    const restored = chroniclesApplyRunCheckpoint(base, {
      worldFlags,
      consumedContentIds: [],
      claimedRewards: [],
    });

    expect(restored.party.every((member) => member.hp === 0)).toBe(true);
    expect(restored.phase).toBe('defeated');
  });
});
