import { describe, expect, it } from 'vitest';
import { chroniclesObjective, chroniclesReduce, createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsUse } from '../chroniclesOfMatthiasTactics.js';
import {
  applyChroniclesTacticsProgression,
  chroniclesHeroProgress,
  createChroniclesProgression,
} from '../chroniclesOfMatthiasProgression.js';
import { chroniclesApplyArrival, chroniclesArriveOnTransition } from './chroniclesArrival.js';
import { chroniclesRegionHudLocation } from './chroniclesRegionHud.js';
import { chroniclesGoldBalance } from './chroniclesContentRuntime.js';
import { chroniclesMapById, chroniclesMapTransitionState } from './chroniclesMapCatalog.js';
import { chroniclesApplyRunCheckpoint, chroniclesRunCheckpointPayload } from './chroniclesRunCheckpoint.js';

const MAIN = 'lost-king';
const use = (state, x, y, id) => chroniclesTacticsUse({ ...state, x, y }, id);

function arrive() {
  return chroniclesApplyArrival(createChroniclesState('swordhaven-first-book'));
}

function travel(state, x, y, exitId) {
  return chroniclesArriveOnTransition(state, use(state, x, y, exitId));
}

// The sewers' two goals, as combat and the wheel would leave them.
function clearSewers(state) {
  let next = use(state, 15, 9, 'sewers-sluice-wheel');
  next = { ...next, sewersSmugglerHp: 0, sewersSmugglerDefeated: true };
  return next;
}

describe('Chronicles · Swordhaven main quest: never «and now what?»', () => {
  it('opens the main story on arrival, once, pointing at the mayor', () => {
    const state = arrive();
    expect(state.quests[MAIN]).toMatchObject({ status: 'active', title: 'El rey desaparecido' });
    expect(state.quests[MAIN].objective).toMatch(/alcalde Aldric/);
    expect(chroniclesObjective(state)).toMatch(/alcalde Aldric/);
    expect(state.journal.some((entry) => entry.id === 'lost-king-arrival')).toBe(true);
    // Replays and restores never restart it.
    const again = chroniclesApplyArrival({ ...state, quests: {} });
    expect(again.quests).toEqual({});
  });

  it('keeps the sewer grate locked until the mayor hands over the key', () => {
    const state = arrive();
    const locked = use(state, 13, 13, 'swordhaven-to-sewers');
    expect(locked.mapId).toBe('swordhaven-first-book');

    const briefed = use(state, 11, 10, 'swordhaven-mayor');
    expect(briefed.swordhavenMayorMet).toBe(true);
    expect(briefed.inventory['sewer-key'].quantity).toBe(1);
    expect(briefed.quests[MAIN].objective).toMatch(/alcantarillas/);
    expect(briefed.message).toMatch(/Brask.*Ilse.*tablón/);

    const below = travel(briefed, 13, 13, 'swordhaven-to-sewers');
    expect(below.mapId).toBe('swordhaven-sewers');
    expect({ x: below.x, y: below.y }).toEqual({ x: 1, y: 1 });
    expect(below.quests[MAIN].objective).toMatch(/compuerta/);
    // Standing on the ladder, the HUD still follows the story, not the way out.
    expect(chroniclesObjective(below)).toMatch(/compuerta/);
    expect(chroniclesRegionHudLocation(chroniclesMapById(below.mapId))).toEqual({ kind: 'MAZMORRA', value: 'ALCANTARILLAS' });
    expect(below.phase).toBe('explore');
  });

  it('climbs back out to the square without ending the expedition', () => {
    const below = travel(use(arrive(), 11, 10, 'swordhaven-mayor'), 13, 13, 'swordhaven-to-sewers');
    const up = travel(below, 1, 1, 'sewers-to-swordhaven');
    expect(up.mapId).toBe('swordhaven-first-book');
    expect(up.phase).not.toBe('escaped');
    expect({ x: up.x, y: up.y }).toEqual({ x: 13, y: 13 });
  });

  it('pays the sewers once, then sends the company after Garrah, then to Vado de Sal', () => {
    let state = travel(use(arrive(), 11, 10, 'swordhaven-mayor'), 13, 13, 'swordhaven-to-sewers');
    // Half the job is not the job.
    const half = travel(use(state, 15, 9, 'sewers-sluice-wheel'), 1, 1, 'sewers-to-swordhaven');
    expect(chroniclesGoldBalance(use(half, 11, 10, 'swordhaven-mayor-sewers'))).toBe(0);

    state = travel(clearSewers(state), 1, 1, 'sewers-to-swordhaven');
    state = use(state, 11, 10, 'swordhaven-mayor-sewers');
    expect(chroniclesGoldBalance(state)).toBe(25);
    expect(state.claimedRewards).toContain('swordhaven:sewers:v1');
    expect(state.xpAwards).toContainEqual({ id: 'swordhaven:sewers:v1', amount: 40 });
    expect(state.quests[MAIN].objective).toMatch(/Garrah/);
    expect(chroniclesGoldBalance(use(state, 11, 10, 'swordhaven-mayor-sewers'))).toBe(25);

    // Garrah's defeat is remembered by the world, whichever quest sent you.
    const waiting = use(state, 11, 10, 'swordhaven-mayor-route');
    expect(chroniclesGoldBalance(waiting)).toBe(25);
    state = use({ ...state, bannerRoadCaptainDefeated: true }, 11, 10, 'swordhaven-mayor-route');
    expect(chroniclesGoldBalance(state)).toBe(55);
    expect(state.quests[MAIN].objective).toMatch(/Vado de Sal/);
  });

  it('grants quest XP to every living hero, once per run', () => {
    let state = travel(use(arrive(), 11, 10, 'swordhaven-mayor'), 13, 13, 'swordhaven-to-sewers');
    state = travel(clearSewers(state), 1, 1, 'sewers-to-swordhaven');
    const before = state;
    const after = use(state, 11, 10, 'swordhaven-mayor-sewers');
    const first = applyChroniclesTacticsProgression(createChroniclesProgression(), before, after, { runId: 'run-a' });
    const living = after.party.filter((member) => member.hp > 0);
    expect(first.awards).toHaveLength(living.length);
    living.forEach((member) => expect(chroniclesHeroProgress(first.progression, member.id).xp).toBe(40));
    const replay = applyChroniclesTacticsProgression(first.progression, before, after, { runId: 'run-a' });
    expect(replay.awards).toHaveLength(0);
  });

  it('keeps named foes down when the company comes back', () => {
    const below = { ...travel(use(arrive(), 11, 10, 'swordhaven-mayor'), 13, 13, 'swordhaven-to-sewers'), sewersSmugglerDefeated: true };
    const up = chroniclesMapTransitionState(below, 'swordhaven-first-book');
    const back = chroniclesMapTransitionState(up, 'swordhaven-sewers');
    expect(back.sewersSmugglerHp).toBe(0);
    expect(back.sewersGoblinWestHp).toBe(chroniclesMapById('swordhaven-sewers').enemies[0].maxHp);
  });

  it('survives F5 mid-story', () => {
    let state = travel(use(arrive(), 11, 10, 'swordhaven-mayor'), 13, 13, 'swordhaven-to-sewers');
    state = clearSewers(state);
    const restored = chroniclesApplyRunCheckpoint(
      createChroniclesState('swordhaven-sewers'),
      chroniclesRunCheckpointPayload(state, 5),
    );
    expect(restored.sewersSluiceClosed).toBe(true);
    expect(restored.sewersSmugglerDefeated).toBe(true);
    expect(restored.quests[MAIN].status).toBe('active');
    expect(chroniclesApplyArrival(restored).quests[MAIN].objective).toBe(restored.quests[MAIN].objective);
  });

  it('every quest-giver in Swordhaven pays XP as well as gold', () => {
    const town = chroniclesMapById('swordhaven-first-book');
    const rewards = town.interactables.flatMap((entry) => entry.action.effects)
      .filter((effect) => effect.type === 'claim-reward');
    expect(rewards.length).toBeGreaterThanOrEqual(5);
    rewards.forEach((reward) => {
      expect(reward.effects.some((effect) => effect.type === 'award-xp'), reward.rewardId).toBe(true);
    });
  });

  it('interacting in front of the town hall talks to the mayor', () => {
    const state = chroniclesReduce({ ...arrive(), x: 10, y: 10, direction: 1 }, 'interact');
    expect(state.swordhavenMayorMet).toBe(true);
  });
});
