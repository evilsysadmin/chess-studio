import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getWarRoomHansActor,
  getWarRoomHansNarrativePhase,
  setWarRoomHansRuntimeState,
  WAR_ROOM_HANS_ACTOR_VERSION,
} from './WarRoomHansActor.js';

const originalDocument = globalThis.document;

afterEach(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  vi.restoreAllMocks();
});

function makeRoot() {
  const root = new THREE.Group();
  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.userData.refs = { torso: new THREE.Group(), head: new THREE.Group() };
  root.add(hans);
  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  driver.onBeforeRender = () => {};
  root.add(driver);
  return { root, hans, driver };
}

describe('War Room Hans actor', () => {
  it('resuelve una identidad canónica reutilizable para todas las rutinas', () => {
    const { root, hans, driver } = makeRoot();
    const actor = getWarRoomHansActor(root);
    expect(actor.hans).toBe(hans);
    expect(actor.driver).toBe(driver);
    expect(actor.body).toBe(hans.userData.refs);
    expect(actor.version).toBe(WAR_ROOM_HANS_ACTOR_VERSION);
    expect(getWarRoomHansActor(root)).toBe(actor);
  });

  it('centraliza la fase narrativa y el estado runtime sin acoplar cada rutina al DOM', () => {
    const { root, hans } = makeRoot();
    const canvas = { isConnected: true, dataset: { warRoomHansNarrativePhase: 'peek' } };
    globalThis.document = { querySelector: vi.fn(() => canvas) };
    const actor = getWarRoomHansActor(root);

    expect(getWarRoomHansNarrativePhase(actor)).toBe('peek');
    expect(globalThis.document.querySelector).toHaveBeenCalledTimes(1);
    expect(getWarRoomHansNarrativePhase(actor)).toBe('peek');
    expect(globalThis.document.querySelector).toHaveBeenCalledTimes(1);

    setWarRoomHansRuntimeState(actor, 'warRoomHansRoutine', 'board-peek');
    expect(hans.userData.warRoomHansRoutine).toBe('board-peek');
  });
});