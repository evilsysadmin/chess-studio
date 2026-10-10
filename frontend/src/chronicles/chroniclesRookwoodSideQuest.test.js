import { describe, expect, it } from 'vitest';
import { chroniclesContextualContentAction, chroniclesObjective, chroniclesReduce, createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsInteractions, chroniclesTacticsUse } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesGoldBalance, chroniclesInventoryEntries, chroniclesQuestEntries } from './chroniclesContentRuntime.js';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import { chroniclesApplyRunCheckpoint, chroniclesRunCheckpointPayload } from './chroniclesRunCheckpoint.js';

const QUEST = 'names-in-wood';
const PLAQUE = 'rookwood-name-plaque';
// Facing: 0 north, 1 east, 2 south, 3 west.
const face = (state, x, y, direction) => ({ ...state, x, y, direction });
const interact = (state) => chroniclesReduce(state, 'interact');

function enterRookwood() {
  let state = createChroniclesState('banner-road-first-book');
  state = chroniclesTacticsUse({ ...state, x: 19, y: 10 }, 'to-banner-road-rookwood');
  return state;
}

function collectPlaques(state) {
  let next = interact(face(state, 5, 4, 0));
  next = interact(face(next, 17, 1, 1));
  // The den plaque sits behind an optional hound; remove it for the loot path.
  next = interact(face({ ...next, rookwoodHoundHp: 0 }, 19, 12, 2));
  return next;
}

describe('Chronicles first book · Rookwood side quest «Los nombres del bosque»', () => {
  it('opens Rookwood from Banner Road with a reciprocal return road', () => {
    const road = chroniclesMapById('banner-road-first-book');
    const wood = chroniclesMapById('rookwood-first-book');
    expect(wood.regionKind).toBe('wilderness');
    expect(road.exits.find((exit) => exit.id === 'to-banner-road-rookwood').action.effects[0]).toMatchObject({
      type: 'transition-map', mapId: wood.id, entryExitId: 'to-rookwood-banner-road',
    });

    let state = enterRookwood();
    expect(state.mapId).toBe('rookwood-first-book');
    expect({ x: state.x, y: state.y }).toEqual({ x: 1, y: 7 });
    state = chroniclesTacticsUse(state, 'to-rookwood-banner-road');
    expect(state.mapId).toBe('banner-road-first-book');
    expect({ x: state.x, y: state.y }).toEqual({ x: 19, y: 10 });
  });

  it('points the HUD objective at Edda, then at the quest, not at the way out', () => {
    let state = enterRookwood();
    expect(chroniclesObjective(state)).toBe('Hablar con Edda, la leñadora');
    state = interact(face(state, 3, 7, 1));
    expect(chroniclesObjective(state)).toMatch(/placas/);
  });

  it('keeps the plaques hidden until Edda gives the side quest', () => {
    const state = enterRookwood();
    expect(chroniclesContextualContentAction(face(state, 5, 4, 0))).toBeNull();
    expect(chroniclesContextualContentAction(face(state, 3, 7, 1))?.id).toBe('rookwood-mourner');
  });

  it('completes the side quest once: accept, gather three plaques, hang them, get paid', () => {
    let state = interact(face(enterRookwood(), 3, 7, 1));
    expect(state.quests[QUEST]).toMatchObject({ status: 'active', title: 'Los nombres del bosque' });
    expect(chroniclesQuestEntries(state, 'active').map((quest) => quest.id)).toContain(QUEST);

    // The oak refuses half the names and pays nothing.
    const early = interact(face(state, 15, 5, 1));
    expect(early.quests[QUEST].status).toBe('active');
    expect(chroniclesGoldBalance(early)).toBe(0);

    state = collectPlaques(state);
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({ id: PLAQUE, quantity: 3 }));
    // A recovered plaque is consumed from the world, not re-lootable.
    expect(chroniclesContextualContentAction(face(state, 5, 4, 0))?.id).not.toBe('rookwood-plaque-hollow');

    state = face(state, 15, 5, 1);
    expect(chroniclesContextualContentAction(state)?.id).toBe('rookwood-name-oak');
    state = interact(state);
    expect(state.quests[QUEST].status).toBe('completed');
    expect(chroniclesGoldBalance(state)).toBe(15);
    expect(state.inventory).not.toHaveProperty(PLAQUE);
    expect(state.claimedRewards).toEqual(['rookwood:names-in-wood:v1']);

    // Replaying the turn-in cannot pay twice.
    const replay = chroniclesTacticsUse({ ...state, x: 16, y: 5 }, 'rookwood-name-oak');
    expect(chroniclesGoldBalance(replay)).toBe(15);

    // Edda closes the thread and points toward the crypt.
    const thanks = interact(face(state, 3, 7, 1));
    expect(thanks.rookwoodMournerThanked).toBe(true);
    expect(thanks.message).toMatch(/Ilse/);
  });

  it('recovers the side quest mid-way and after completion across F5', () => {
    let state = interact(face(enterRookwood(), 3, 7, 1));
    state = interact(face(state, 5, 4, 0));
    const mid = chroniclesApplyRunCheckpoint(createChroniclesState('rookwood-first-book'), chroniclesRunCheckpointPayload(state, 3));
    expect(mid.quests[QUEST].status).toBe('active');
    expect(mid.inventory[PLAQUE].quantity).toBe(1);
    expect(chroniclesTacticsInteractions({ ...mid, x: 5, y: 3 }).some((entry) => entry.id === 'rookwood-plaque-hollow')).toBe(false);

    state = collectPlaques(state);
    state = interact(face(state, 15, 5, 1));
    const snapshot = chroniclesRunCheckpointPayload(state, 4);
    expect(snapshot.claimedRewards).toEqual(['rookwood:names-in-wood:v1']);
    const restored = chroniclesApplyRunCheckpoint(createChroniclesState('rookwood-first-book'), snapshot);
    expect(restored.quests[QUEST].status).toBe('completed');
    expect(chroniclesGoldBalance(restored)).toBe(15);
    const again = chroniclesTacticsUse({ ...restored, x: 16, y: 5 }, 'rookwood-name-oak');
    expect(chroniclesGoldBalance(again)).toBe(15);
  });
});
