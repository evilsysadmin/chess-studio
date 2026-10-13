import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import { chroniclesMapById } from './chronicles/chroniclesMapCatalog.js';
import {
  chroniclesChooseEnemyStep,
  chroniclesEnemyHasSightline,
  chroniclesRememberEnemySight,
} from './chroniclesOfMatthiasTurns.js';
import { chroniclesApplyRunCheckpoint, chroniclesRunCheckpointPayload } from './chronicles/chroniclesRunCheckpoint.js';

const mapId = 'menagerie-of-ash';
const hound = chroniclesMapById(mapId).enemies.find((enemy) => enemy.id === 'bone-hound');

function scenario(partyPosition = { x: 3, y: 5 }) {
  const initial = createChroniclesState(mapId);
  return {
    ...initial,
    phase: 'explore',
    enemyPositions: { 'bone-hound': { x: 3, y: 3 } },
    ashGoblinHp: 0,
    cryptSpiderHp: 0,
    party: initial.party.map((member) => ({ ...member, hp: member.id === 'matthias' ? member.hp : 0 })),
    partyPositions: { matthias: partyPosition },
    x: partyPosition.x,
    y: partyPosition.y,
    explorationEnemySteps: 0,
  };
}

describe('Chronicles enemy perception and short-term memory', () => {
  it('cannot see through a solid wall or a blocked diagonal corner', () => {
    const state = scenario();
    expect(chroniclesEnemyHasSightline(state, { x: 3, y: 3 }, { x: 1, y: 1 })).toBe(false);
    expect(chroniclesEnemyHasSightline(state, { x: 3, y: 3 }, { x: 3, y: 5 })).toBe(true);
  });

  it('investigates the last seen square, not the hidden current party location', () => {
    const witnessed = chroniclesRememberEnemySight(scenario(), hound);
    expect(witnessed.enemyAwareness['bone-hound']).toMatchObject({ x: 3, y: 5 });
    const hidden = { ...witnessed, x: 1, y: 1, partyPositions: { matthias: { x: 1, y: 1 } }, explorationEnemySteps: 3 };
    const remembered = chroniclesRememberEnemySight(hidden, hound);
    expect(remembered.enemyAwareness['bone-hound']).toMatchObject({ x: 3, y: 5 });
    expect(chroniclesChooseEnemyStep(remembered, hound)).toMatchObject({ x: 3, y: 4 });
  });

  it('forgets the last sighting after two enemy movement activations', () => {
    const witnessed = chroniclesRememberEnemySight(scenario(), hound);
    const hidden = {
      ...witnessed, x: 1, y: 1, partyPositions: { matthias: { x: 1, y: 1 } },
      explorationEnemySteps: 9,
    };
    const next = chroniclesRememberEnemySight(hidden, hound);
    expect(next.enemyAwareness['bone-hound']).toBeUndefined();
  });

  it('also expires memory by tactical combat rounds without an initiative rail', () => {
    const witnessed = chroniclesRememberEnemySight({
      ...scenario(), phase: 'combat', turnPhase: 'enemy', round: 1,
    }, hound);
    expect(witnessed.enemyAwareness['bone-hound']).toMatchObject({ phase: 'combat', tick: 1 });
    const later = chroniclesRememberEnemySight({
      ...witnessed, x: 1, y: 1, partyPositions: { matthias: { x: 1, y: 1 } },
      round: 4,
    }, hound);
    expect(later.enemyAwareness['bone-hound']).toBeUndefined();
  });

  it('keeps a bounded sighting through the authoritative checkpoint without changing its schema', () => {
    const witnessed = chroniclesRememberEnemySight(scenario(), hound);
    const payload = chroniclesRunCheckpointPayload(witnessed, 0);
    const recovered = chroniclesApplyRunCheckpoint(createChroniclesState(mapId), {
      worldFlags: payload.worldFlags,
      consumedContentIds: payload.consumedContentIds,
      claimedRewards: payload.claimedRewards,
    });
    expect(recovered.enemyAwareness['bone-hound']).toEqual(witnessed.enemyAwareness['bone-hound']);
    expect(Object.keys(recovered.enemyAwareness)).toEqual(['bone-hound']);
  });
});
