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

  it('gives authored Ash Vault and Chain Basilica hazards real one-shot damage', () => {
    const vault = chroniclesMapById('ash-vault');
    expect(vault.traps).toEqual([
      expect.objectContaining({
        id: 'vault-slag-vent',
        visualType: 'slag-vent',
        x: 5,
        y: 5,
      }),
    ]);

    let vaultState = chroniclesMapTransitionState(createChroniclesState(), 'ash-vault');
    vaultState = { ...vaultState, x: 4, y: 5 };
    const vaultHp = vaultState.party.map((member) => member.hp);
    const scorched = chroniclesTacticsMove(vaultState, { x: 5, y: 5 });

    expect(scorched.vaultSlagVentSpent).toBe(true);
    expect(scorched.party.map((member) => member.hp)).toEqual(
      vaultHp.map((hp) => (hp > 0 ? Math.max(0, hp - 1) : hp)),
    );

    const basilica = chroniclesMapById('chain-basilica');
    expect(basilica.traps).toEqual([
      expect.objectContaining({
        id: 'basilica-chain-plate',
        visualType: 'chain-plate',
        x: 8,
        y: 3,
      }),
    ]);

    let basilicaState = chroniclesMapTransitionState(createChroniclesState(), 'chain-basilica');
    basilicaState = { ...basilicaState, x: 7, y: 3 };
    const basilicaHp = basilicaState.party.map((member) => member.hp);
    const chained = chroniclesTacticsMove(basilicaState, { x: 8, y: 3 });

    expect(chained.basilicaChainPlateSpent).toBe(true);
    expect(chained.party.map((member) => member.hp)).toEqual(
      basilicaHp.map((hp) => (hp > 0 ? Math.max(0, hp - 2) : hp)),
    );
  });

});
