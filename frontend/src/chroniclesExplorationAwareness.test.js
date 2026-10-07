import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  CHRONICLES_EXPLORATION_SEARCH_ACTIVATIONS,
  chroniclesAdvanceExplorationEnemies,
} from './chronicles/chroniclesExplorationEnemyActivity.js';
import {
  chroniclesApplyRunCheckpoint,
  chroniclesRunCheckpointPayload,
} from './chronicles/chroniclesRunCheckpoint.js';
import { chroniclesRuntimeEnemyPosition } from './chroniclesOfMatthiasTurns.js';

function ashGoblinOnly(overrides = {}) {
  return {
    ...createChroniclesState('menagerie-of-ash'),
    ashGoblinHp: 5,
    cryptSpiderHp: 0,
    emberWispHp: 0,
    boneHoundHp: 0,
    enemyPositions: {
      'ash-goblin': { x: 5, y: 3 },
    },
    ...overrides,
  };
}

function ashGoblin(state) {
  return {
    id: 'ash-goblin',
    x: 3,
    y: 5,
  };
}

describe('Chronicles exploration enemy awareness', () => {
  it('chases before combat, then searches the last known position after contact is lost', () => {
    const previous = ashGoblinOnly({
      x: 1,
      y: 4,
      explorationEnemySteps: 2,
    });
    const enteredAwareness = {
      ...previous,
      x: 1,
      y: 3,
    };

    const chasing = chroniclesAdvanceExplorationEnemies(previous, enteredAwareness);

    expect(chasing.initiative ?? null).toBeNull();
    expect(chroniclesRuntimeEnemyPosition(chasing, ashGoblin(chasing))).toEqual({ x: 4, y: 3 });
    expect(chasing.enemyExplorationAwareness?.['ash-goblin']).toEqual({
      mode: 'chase',
      lastKnown: { x: 1, y: 3 },
      remaining: CHRONICLES_EXPLORATION_SEARCH_ACTIVATIONS,
    });

    const searchPrevious = {
      ...chasing,
      x: 1,
      y: 5,
      explorationEnemySteps: 5,
    };
    const searchNext = {
      ...searchPrevious,
      x: 2,
      y: 5,
    };
    const searching = chroniclesAdvanceExplorationEnemies(searchPrevious, searchNext);

    expect(chroniclesRuntimeEnemyPosition(searching, ashGoblin(searching))).toEqual({ x: 3, y: 3 });
    expect(searching.enemyExplorationAwareness?.['ash-goblin']).toEqual({
      mode: 'search',
      lastKnown: { x: 1, y: 3 },
      remaining: 1,
    });

    const finalSearchPrevious = {
      ...searching,
      x: 2,
      y: 5,
      explorationEnemySteps: 8,
    };
    const finalSearchNext = {
      ...finalSearchPrevious,
      x: 1,
      y: 5,
    };
    const forgotten = chroniclesAdvanceExplorationEnemies(finalSearchPrevious, finalSearchNext);

    expect(chroniclesRuntimeEnemyPosition(forgotten, ashGoblin(forgotten))).toEqual({ x: 2, y: 3 });
    expect(forgotten.enemyExplorationAwareness?.['ash-goblin']).toBeUndefined();
  });

  it('round-trips awareness memory through the authoritative run checkpoint', () => {
    const state = ashGoblinOnly({
      enemyExplorationAwareness: {
        'ash-goblin': {
          mode: 'search',
          lastKnown: { x: 2, y: 3 },
          remaining: 1,
        },
      },
    });
    const payload = chroniclesRunCheckpointPayload(state, 7);
    const recovered = chroniclesApplyRunCheckpoint(
      createChroniclesState('menagerie-of-ash'),
      {
        worldFlags: payload.worldFlags,
        inventory: payload.inventory,
        quests: payload.quests,
        consumedContentIds: payload.consumedContentIds,
        claimedRewards: payload.claimedRewards,
      },
    );

    expect(recovered.enemyExplorationAwareness).toEqual(state.enemyExplorationAwareness);
  });

  it('keeps authored patrols on their route until return-to-route AI exists', () => {
    const previous = {
      ...createChroniclesState('menagerie-of-ash'),
      x: 1,
      y: 4,
      ashGoblinHp: 0,
      cryptSpiderHp: 4,
      emberWispHp: 0,
      boneHoundHp: 0,
      explorationEnemySteps: 2,
      enemyPositions: {
        'crypt-spider': { x: 3, y: 3 },
      },
    };
    const next = {
      ...previous,
      x: 1,
      y: 5,
    };

    const advanced = chroniclesAdvanceExplorationEnemies(previous, next);

    expect(chroniclesRuntimeEnemyPosition(advanced, { id: 'crypt-spider', x: 3, y: 3 }))
      .toEqual({ x: 4, y: 3 });
    expect(advanced.enemyExplorationAwareness?.['crypt-spider']).toBeUndefined();
  });

});
