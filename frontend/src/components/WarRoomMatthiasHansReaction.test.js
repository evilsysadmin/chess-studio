import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installWarRoomMatthiasHansReaction,
  shouldMatthiasLookAtHans,
  WAR_ROOM_MATTHIAS_HANS_REACTION_VERSION,
} from './WarRoomMatthiasHansReaction.js';

const originalDocument = globalThis.document;

afterEach(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  vi.restoreAllMocks();
});

function makeScene(dataset = { warRoomHansNarrativePhase: 'matthias-working' }) {
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
    querySelector: vi.fn(() => ({ dataset })),
  };

  return { root, hans, matthias, driver };
}

describe('Matthias reacts to Hans', () => {
  it('covers fire interruption, mop complaint/sigh and espresso reply only', () => {
    expect(shouldMatthiasLookAtHans({ warRoomHansNarrativePhase: 'matthias-working' })).toBe(true);
    expect(shouldMatthiasLookAtHans({ warRoomHansMopDialogue: 'matthias' })).toBe(true);
    expect(shouldMatthiasLookAtHans({ warRoomHansMopDialogue: 'sigh' })).toBe(true);
    expect(shouldMatthiasLookAtHans({ warRoomHansServiceDialogue: 'matthias-espresso' })).toBe(true);
    expect(shouldMatthiasLookAtHans({ warRoomHansMopDialogue: 'hans' })).toBe(false);
    expect(shouldMatthiasLookAtHans({ warRoomHansServiceDialogue: 'hans-espresso' })).toBe(false);
    expect(shouldMatthiasLookAtHans({ warRoomHansServiceDialogue: 'water-plant' })).toBe(false);
  });

  it('turns subtly toward Hans during the fireplace interruption', () => {
    const { root, matthias, driver } = makeScene();
    const baseYaw = matthias.rotation.y;

    expect(installWarRoomMatthiasHansReaction(root)).toBe(1);
    driver.onBeforeRender();

    expect(driver.userData.warRoomMatthiasHansReaction).toBe(WAR_ROOM_MATTHIAS_HANS_REACTION_VERSION);
    expect(matthias.userData.warRoomMatthiasHansReactionActive).toBe(true);
    expect(matthias.rotation.y).not.toBe(baseYaw);
  });

  it('also turns toward Hans while Matthias answers the espresso', () => {
    const { root, matthias, driver } = makeScene({ warRoomHansServiceDialogue: 'matthias-espresso' });
    const baseYaw = matthias.rotation.y;

    expect(installWarRoomMatthiasHansReaction(root)).toBe(1);
    driver.onBeforeRender();

    expect(matthias.userData.warRoomMatthiasHansReactionActive).toBe(true);
    expect(matthias.rotation.y).not.toBe(baseYaw);
  });

  it('returns to his base orientation for unrelated Hans phases', () => {
    const { root, matthias, driver } = makeScene({ warRoomHansNarrativePhase: 'peek' });
    const baseYaw = matthias.rotation.y;

    expect(installWarRoomMatthiasHansReaction(root)).toBe(1);
    driver.onBeforeRender();

    expect(matthias.userData.warRoomMatthiasHansReactionActive).toBe(false);
    expect(matthias.rotation.y).toBe(baseYaw);
  });
});
