import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_DAMAGE_FEEDBACK,
  chroniclesTacticsDamageTransition,
  installChroniclesTacticsDamageFeedbackArt,
} from './chroniclesOfMatthiasDamageFeedbackArt.js';

function partyFixture() {
  const scene = new THREE.Scene();
  const partyRoot = new THREE.Group();
  scene.add(partyRoot);
  const models = new Map();
  ['rook', 'matthias', 'bishop', 'knight'].forEach((id, index) => {
    const model = new THREE.Group();
    model.position.set((index - 1.5) * 0.9, 0, index % 2 ? 0.28 : 0.08);
    partyRoot.add(model);
    models.set(id, model);
  });
  return { scene, partyRoot, models };
}

afterEach(() => vi.useRealTimers());

describe('Chronicles Tactics party damage feedback', () => {
  it('reacts only to real HP loss', () => {
    expect(chroniclesTacticsDamageTransition(undefined, 1).hit).toBe(false);
    expect(chroniclesTacticsDamageTransition(0.5, 0.8).hit).toBe(false);
    const hit = chroniclesTacticsDamageTransition(1, 0.7);
    expect(hit.hit).toBe(true);
    expect(hit.delta).toBeCloseTo(0.3, 6);
    expect(hit.severity).toBeGreaterThan(0.35);
  });

  it('flashes the struck member briefly without any frame loop', () => {
    vi.useFakeTimers();
    const { models } = partyFixture();
    const root = installChroniclesTacticsDamageFeedbackArt(models, { coarsePointer: false });
    const matthias = models.get('matthias');
    const floor = root.getObjectByName('chronicles-party-hit-floor-matthias');
    const slash = root.getObjectByName('chronicles-party-hit-slash-matthias');

    matthias.userData.chroniclesIsoHpRatio = 1;
    expect(floor.visible).toBe(false);
    expect(slash.visible).toBe(false);

    matthias.userData.chroniclesIsoHpRatio = 0.7;
    expect(floor.visible).toBe(true);
    expect(slash.visible).toBe(true);

    vi.advanceTimersByTime(CHRONICLES_TACTICS_DAMAGE_FEEDBACK.lifetimeMs + 1);
    expect(floor.visible).toBe(false);
    expect(slash.visible).toBe(false);
  });

  it('keeps coarse-pointer feedback minimal and installation idempotent', () => {
    vi.useFakeTimers();
    const { models } = partyFixture();
    const first = installChroniclesTacticsDamageFeedbackArt(models, { coarsePointer: true });
    const second = installChroniclesTacticsDamageFeedbackArt(models, { coarsePointer: true });
    expect(second).toBe(first);

    const rook = models.get('rook');
    rook.userData.chroniclesIsoHpRatio = 1;
    rook.userData.chroniclesIsoHpRatio = 0.8;
    expect(first.getObjectByName('chronicles-party-hit-floor-rook').visible).toBe(true);
    expect(first.getObjectByName('chronicles-party-hit-slash-rook').visible).toBe(false);
  });
});
