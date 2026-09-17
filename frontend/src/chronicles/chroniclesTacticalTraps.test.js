import { afterEach, describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsMove } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesApplyContentEffects } from './chroniclesContentRuntime.js';
import {
  chroniclesClearRuntimeMapDefinitions,
  chroniclesInstallRuntimeMapDefinition,
  chroniclesMapById,
  chroniclesMapTransitionState,
} from './chroniclesMapCatalog.js';

function installTrapFixture() {
  const base = chroniclesMapById('ash-vault');
  return chroniclesInstallRuntimeMapDefinition({
    ...base,
    version: Number(base.version || 1) + 100,
    grid: [...base.grid],
    partyStart: { ...base.partyStart },
    initialFlags: { ...base.initialFlags, testTrapSpent: false },
    enemies: [...base.enemies],
    triggers: [...base.triggers],
    interactables: [...base.interactables],
    treasures: [...base.treasures],
    traps: [
      {
        id: 'test-spike-plate',
        kind: 'trap',
        x: 1,
        y: 4,
        label: 'Placa de pinchos',
        when: [{ key: 'testTrapSpent', equals: false }],
        action: {
          effects: [
            { type: 'set', key: 'testTrapSpent', value: true },
            { type: 'damage-party', amount: 2 },
          ],
          message: 'La placa cede y una hilera de pinchos cobra peaje en sangre.',
        },
      },
    ],
    exits: [...base.exits],
    initialJournal: { ...base.initialJournal },
  });
}

afterEach(() => {
  chroniclesClearRuntimeMapDefinitions();
});

describe('Chronicles tactical traps', () => {
  it('damages living party members and marks a full-party knockout as defeat', () => {
    const next = chroniclesApplyContentEffects({
      phase: 'explore',
      party: [
        { id: 'matthias', hp: 1, maxHp: 8 },
        { id: 'rook', hp: 0, maxHp: 10 },
      ],
    }, [{ type: 'damage-party', amount: 2 }]);

    expect(next.party.map((member) => member.hp)).toEqual([0, 0]);
    expect(next.phase).toBe('defeated');
  });

  it('fires an authored trap automatically on entry and only while its authored condition remains true', () => {
    installTrapFixture();
    const state = chroniclesMapTransitionState(createChroniclesState(), 'ash-vault');
    const hpBefore = state.party.map((member) => member.hp);

    const trapped = chroniclesTacticsMove(state, { x: 1, y: 4 });

    expect({ x: trapped.x, y: trapped.y }).toEqual({ x: 1, y: 4 });
    expect(trapped.turns).toBe(state.turns + 1);
    expect(trapped.testTrapSpent).toBe(true);
    expect(trapped.party.map((member) => member.hp)).toEqual(
      hpBefore.map((hp) => (hp > 0 ? Math.max(0, hp - 2) : hp)),
    );
    expect(trapped.message).toMatch(/pinchos/i);

    const retreat = chroniclesTacticsMove(trapped, { x: 1, y: 5 });
    const hpAfterFirstTrigger = retreat.party.map((member) => member.hp);
    const returned = chroniclesTacticsMove(retreat, { x: 1, y: 4 });

    expect(returned.party.map((member) => member.hp)).toEqual(hpAfterFirstTrigger);
    expect(returned.testTrapSpent).toBe(true);
  });
});
