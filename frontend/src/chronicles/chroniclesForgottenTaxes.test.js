import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsUse } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import { chroniclesContentVisualStates } from './chroniclesContentVisualState.js';
import { chroniclesGoldBalance } from './chroniclesContentRuntime.js';
import { chroniclesApplyRunCheckpoint, chroniclesRunCheckpointPayload } from './chroniclesRunCheckpoint.js';

const QUEST = 'tax-of-the-forgotten';
const LEDGER = 'forgotten-tax-ledger';
const use = (state, entry) => chroniclesTacticsUse({ ...state, x: entry.x, y: entry.y }, entry.id);
const talk = (state, id) => use(state, chroniclesMapById(state.mapId).interactables.find((entry) => entry.id === id));

function travel(state, mapId) {
  const exit = chroniclesMapById(state.mapId).exits.find((entry) => entry.action.effects.some(
    (effect) => effect.type === 'transition-map' && effect.mapId === mapId,
  ));
  expect(exit, `${state.mapId} -> ${mapId}`).toBeTruthy();
  return use(state, exit);
}
function visibleActorCount(state, prefix) {
  return chroniclesContentVisualStates(state).filter(
    (entry) => entry.id.startsWith(prefix) && entry.visible,
  ).length;
}

describe('Chronicles · misterio original de los tributos olvidados (B4–E4)', () => {
  it('connects a real investigation to overworld travel with one visible NPC per stage', () => {
    let state = createChroniclesState('terra-b4');
    expect(visibleActorCount(state, 'b4-farmer')).toBe(1);
    state = talk(state, 'b4-farmer');
    expect(state.quests[QUEST].objective).toMatch(/E4/);
    expect(visibleActorCount(state, 'b4-farmer')).toBe(1);

    for (const map of ['terra-c4', 'terra-d4', 'terra-e4']) state = travel(state, map);
    expect(visibleActorCount(state, 'e4-bruno')).toBe(1);
    state = talk(state, 'e4-bruno-ledger');
    expect(state.inventory[LEDGER].quantity).toBe(1);
    expect(state.quests[QUEST].objective).toMatch(/B4/);
    expect(visibleActorCount(state, 'e4-bruno')).toBe(1);

    for (const map of ['terra-d4', 'terra-c4', 'terra-b4']) state = travel(state, map);
    const goldBefore = chroniclesGoldBalance(state);
    state = talk(state, 'b4-farmer-proof');
    expect(state.quests[QUEST].status).toBe('completed');
    expect(state.inventory[LEDGER]).toBeUndefined();
    expect(chroniclesGoldBalance(state)).toBe(goldBefore + 22);
    expect(state.claimedRewards).toContain('terra:b4:tax-absent:v1');
    expect(visibleActorCount(state, 'b4-farmer')).toBe(1);

    state = talk(state, 'b4-farmer-after');
    expect(chroniclesGoldBalance(state)).toBe(goldBefore + 22);
  });

  it('survives F5 before and after handing in the ledger, without farming it', () => {
    let state = talk(createChroniclesState('terra-b4'), 'b4-farmer');
    for (const map of ['terra-c4', 'terra-d4', 'terra-e4']) state = travel(state, map);
    state = talk(state, 'e4-bruno-ledger');
    let recovered = chroniclesApplyRunCheckpoint(
      createChroniclesState('terra-e4'), chroniclesRunCheckpointPayload(state, 4),
    );
    expect(recovered.e4LedgerRecovered).toBe(true);
    expect(recovered.b4TaxLeadStarted).toBe(true);
    expect(recovered.inventory[LEDGER].quantity).toBe(1);
    recovered = talk(recovered, 'e4-bruno-after');
    expect(recovered.inventory[LEDGER].quantity).toBe(1);

    for (const map of ['terra-d4', 'terra-c4', 'terra-b4']) recovered = travel(recovered, map);
    const settled = talk(recovered, 'b4-farmer-proof');
    const saved = chroniclesRunCheckpointPayload(settled, 5);
    const again = chroniclesApplyRunCheckpoint(createChroniclesState('terra-b4'), saved);
    expect(again.quests[QUEST].status).toBe('completed');
    expect(again.claimedRewards).toContain('terra:b4:tax-absent:v1');
    expect(again.inventory[LEDGER]).toBeUndefined();
    expect(chroniclesGoldBalance(talk(again, 'b4-farmer-after'))).toBe(chroniclesGoldBalance(settled));
  });
});
