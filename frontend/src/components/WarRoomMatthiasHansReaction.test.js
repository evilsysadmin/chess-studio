import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installWarRoomMatthiasHansReaction,
  WAR_ROOM_MATTHIAS_HANS_REACTION_VERSION,
} from './WarRoomMatthiasHansReaction.js';

const originalDocument = globalThis.document;

afterEach(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  vi.restoreAllMocks();
});

function makeScene(phase = 'matthias-working') {
  const root = new THREE.Scene();
  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.position.set(-3, 0, 0);
  hans.visible = true;
  root.add(hans);

  const matthias = new THREE.Group();
  matthias.name = 'matthias-rival-king';
  matthias.position.set(3, 0, 0);
  root.add(matthias);

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  driver.onBeforeRender = () => {};
  root.add(driver);

  globalThis.document = {
    querySelector: vi.fn(() => ({ dataset: { warRoomHansNarrativePhase: phase } })),
  };

  return { root, hans, matthias, driver };
}

describe('Matthias reacts to Hans', () => {
  it('turns subtly toward Hans only during Matthias working interruption', () => {
    const { root, matthias, driver } = makeScene();
    const baseYaw = matthias.rotation.y;

    expect(installWarRoomMatthiasHansReaction(root)).toBe(1);
    driver.onBeforeRender();

    expect(driver.userData.warRoomMatthiasHansReaction).toBe(WAR_ROOM_MATTHIAS_HANS_REACTION_VERSION);
    expect(matthias.userData.warRoomMatthiasHansReactionActive).toBe(true);
    expect(matthias.rotation.y).not.toBe(baseYaw);
  });

  it('does not turn Matthias for unrelated narrative phases', () => {
    const { root, matthias, driver } = makeScene('peek');
    const baseYaw = matthias.rotation.y;

    expect(installWarRoomMatthiasHansReaction(root)).toBe(1);
    driver.onBeforeRender();

    expect(matthias.userData.warRoomMatthiasHansReactionActive).toBe(false);
    expect(matthias.rotation.y).toBe(baseYaw);
  });
});