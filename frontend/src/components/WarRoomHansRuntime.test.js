import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getWarRoomHansActor } from './WarRoomHansActor.js';
import {
  assignWarRoomHansTask,
  getWarRoomHansActiveTask,
  getWarRoomHansRuntime,
  releaseWarRoomHansTask,
  setWarRoomHansTaskPhase,
  warRoomHansTaskAvailable,
  WAR_ROOM_HANS_RUNTIME_VERSION,
} from './WarRoomHansRuntime.js';

function makeActor() {
  const root = new THREE.Group();
  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  root.add(fireplace);
  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.userData.refs = { torso: new THREE.Group(), head: new THREE.Group() };
  fireplace.add(hans);
  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  driver.onBeforeRender = () => {};
  fireplace.add(driver);
  return { root, hans, driver, actor: getWarRoomHansActor(root) };
}

describe('War Room Hans runtime', () => {
  it('owns exactly one task for the canonical actor', () => {
    const { actor, hans, driver } = makeActor();
    const runtime = getWarRoomHansRuntime(actor);

    expect(runtime.version).toBe(WAR_ROOM_HANS_RUNTIME_VERSION);
    expect(getWarRoomHansRuntime(actor)).toBe(runtime);
    expect(assignWarRoomHansTask(runtime, { id: 'service-espresso', kind: 'service' })).toBe(true);
    expect(assignWarRoomHansTask(runtime, { id: 'chore-mail', kind: 'chore' })).toBe(false);
    expect(getWarRoomHansActiveTask(runtime)?.id).toBe('service-espresso');
    expect(hans.userData.warRoomHansActiveTask).toBe('service-espresso');
    expect(driver.userData.warRoomHansActiveTask).toBe('service-espresso');
    expect(warRoomHansTaskAvailable(runtime, 'service-espresso')).toBe(true);
    expect(warRoomHansTaskAvailable(runtime, 'chore-mail')).toBe(false);

    expect(setWarRoomHansTaskPhase(runtime, 'walking-in')).toBe(true);
    expect(hans.userData.warRoomHansTaskPhase).toBe('walking-in');
    expect(releaseWarRoomHansTask(runtime, 'service-espresso')).toBe(true);
    expect(getWarRoomHansActiveTask(runtime)).toBeNull();
    expect(warRoomHansTaskAvailable(runtime, 'chore-mail')).toBe(true);
  });
});
