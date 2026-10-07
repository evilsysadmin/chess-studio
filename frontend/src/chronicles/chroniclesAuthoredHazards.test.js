import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesMapById, chroniclesMapTransitionState } from './chroniclesMapCatalog.js';
import { chroniclesTacticsMove } from '../chroniclesOfMatthiasTactics.js';

describe('Chronicles authored environmental hazards', () => {
  it('keeps Ash Vault and Chain Basilica hazards one-shot and damaging', () => {
    const vault = chroniclesMapById('ash-vault');
    expect(vault.traps).toEqual([
      expect.objectContaining({ id: 'vault-slag-vent', visualType: 'slag-vent', x: 5, y: 5 }),
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
      expect.objectContaining({ id: 'basilica-chain-plate', visualType: 'chain-plate', x: 8, y: 3 }),
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
