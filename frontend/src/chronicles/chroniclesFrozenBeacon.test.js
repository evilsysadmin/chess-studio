import { describe, expect, it } from 'vitest';
import { chroniclesContextualContentAction, createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsUse } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesContentVisualStates } from './chroniclesContentVisualState.js';
import { chroniclesGoldBalance } from './chroniclesContentRuntime.js';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import { chroniclesRunCheckpointPayload, chroniclesApplyRunCheckpoint } from './chroniclesRunCheckpoint.js';

const F1 = 'terra-f1';
const map = chroniclesMapById(F1);
const entry = (id) => map.interactables.find((item) => item.id === id);
const use = (state, id) => {
  const item = entry(id);
  expect(item, id).toBeTruthy();
  return chroniclesTacticsUse({ ...state, x: item.x, y: item.y }, id);
};
function prepare() {
  let state = use(createChroniclesState(F1), 'f1-keepers-log');
  state = use(state, 'f1-frosted-lens');
  return state;
}
const checkpoint = (state, version = 3) =>
  chroniclesApplyRunCheckpoint(createChroniclesState(F1), chroniclesRunCheckpointPayload(state, version));

describe('Chronicles · Faro Helado (F1), secreto original y decisión irreversible', () => {
  it('places clues, salvage, optics and lighthouse on distinct reachable walkable cells', () => {
    const grid = map.grid;
    const locations = ['f1-keepers-log', 'f1-frosted-lens', 'f1-mirror-gear', 'f1-beacon-rescue']
      .map((id) => entry(id));
    for (const item of locations) expect(grid[item.y][item.x], item.id).toBe('.');
    expect(new Set(locations.map((item) => item.x + ',' + item.y)).size).toBe(4);
    expect(map.exits).toHaveLength(2);
    expect(map.treasures.find((item) => item.id === 'terra-f1-chest')).toBeTruthy();
    expect(map.enemies).toHaveLength(3);
  });

  it('offers exactly one reachable first-person action per site and phase', () => {
    const contextual = (state, id) => {
      const node = entry(id);
      return chroniclesContextualContentAction({ ...state, x: node.x, y: node.y });
    };
    const fresh = createChroniclesState(F1);
    expect(contextual(fresh, 'f1-beacon-before')?.id).toBe('f1-beacon-before');
    let state = prepare();
    expect(contextual(state, 'f1-mirror-force')?.id).toBe('f1-mirror-force');
    state = use(state, 'f1-mirror-gear');
    expect(contextual(state, 'f1-beacon-rescue')?.id).toBe('f1-beacon-rescue');
    expect(contextual(state, 'f1-beacon-salvage')?.id).toBe('f1-beacon-salvage');
    state = use(state, 'f1-beacon-rescue');
    expect(contextual(state, 'f1-beacon-before')?.id).toBe('f1-beacon-rescued-after');
    expect(contextual(state, 'f1-beacon-salvage')?.id).not.toBe('f1-beacon-salvage');
  });

  it('requires real salvage, offers a one-time wrong alignment penalty, and persists progress after F5', () => {
    let state = createChroniclesState(F1);
    state = use(state, 'f1-mirror-gear');
    expect(state.f1OpticAligned).not.toBe(true);
    state = prepare();
    expect(state.inventory['f1-frosted-lens'].quantity).toBe(1);
    const health = state.party.map((m) => m.hp);
    state = use(state, 'f1-mirror-force');
    expect(state.f1MirrorScorched).toBe(true);
    expect(state.party.some((m, i) => m.hp < health[i])).toBe(true);
    const wounded = state.party.map((m) => m.hp);
    state = use(state, 'f1-mirror-force');
    expect(state.party.map((m) => m.hp)).toEqual(wounded);
    state = checkpoint(state);
    expect(state.f1MirrorScorched).toBe(true);
    expect(state.inventory['f1-frosted-lens'].quantity).toBe(1);
    state = use(state, 'f1-mirror-gear');
    expect(state.f1OpticAligned).toBe(true);
    expect(state.inventory['f1-frosted-lens']).toBeUndefined();
    const restored = checkpoint(state);
    expect(restored.f1OpticAligned).toBe(true);
    expect(restored.inventory['f1-frosted-lens']).toBeUndefined();
  });

  it.each([
    ['rescue', 'f1-beacon-rescue', 'silver-staff', 0],
    ['salvage', 'f1-beacon-salvage', null, 75],
  ])('branches irreversibly to %s with the same atomic receipt and visible light state', (choice, id, reward, gold) => {
    let state = prepare();
    state = use(state, 'f1-mirror-gear');
    const before = chroniclesGoldBalance(state);
    state = use(state, id);
    expect(state.f1BeaconResolved).toBe(true);
    expect(state.f1BeaconChoice).toBe(choice);
    expect(state.claimedRewards).toEqual(['terra:f1:beacon:v1']);
    expect(chroniclesGoldBalance(state)).toBe(before + gold);
    expect(Boolean(state.inventory[reward]?.quantity)).toBe(Boolean(reward));
    const beacon = chroniclesContentVisualStates(state)
      .find((visual) => visual.id === 'f1-beacon-rescue');
    expect(beacon.visible).toBe(true);
    expect(beacon.activated).toBe(choice === 'rescue');

    const restored = checkpoint(state, 7);
    expect(restored.f1BeaconResolved).toBe(true);
    expect(restored.f1BeaconChoice).toBe(choice);
    const same = use(restored, choice === 'rescue' ? 'f1-beacon-salvage' : 'f1-beacon-rescue');
    expect(same.f1BeaconChoice).toBe(choice);
    expect(same.claimedRewards).toHaveLength(1);
    expect(chroniclesGoldBalance(same)).toBe(before + gold);
  });

  it('lets the party leave through E1 and revisit with the authored beacon flags intact', () => {
    let state = prepare();
    state = use(state, 'f1-mirror-gear');
    state = use(state, 'f1-beacon-rescue');
    const exit = map.exits.find((e) => e.action.effects.some((x) => x.mapId === 'terra-e1'));
    state = chroniclesTacticsUse({ ...state, x: exit.x, y: exit.y }, exit.id);
    expect(state.mapId).toBe('terra-e1');
    const returnGate = chroniclesMapById('terra-e1').exits.find(
      (e) => e.action.effects.some((x) => x.mapId === F1),
    );
    state = chroniclesTacticsUse({ ...state, x: returnGate.x, y: returnGate.y }, returnGate.id);
    expect(state.mapId).toBe(F1);
    expect(state.f1BeaconChoice).toBe('rescue');
  });
});
