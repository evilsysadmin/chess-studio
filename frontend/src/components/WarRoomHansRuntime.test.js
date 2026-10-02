import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getWarRoomHansActor } from './WarRoomHansActor.js';
import {
  assignWarRoomHansTask,
  getWarRoomHansActiveTask,
  getWarRoomHansRuntime,
  releaseWarRoomHansTask,
  setWarRoomHansTaskPhase,
  setWarRoomHansTaskPresentation,
  warRoomHansTaskAvailable,
  WAR_ROOM_HANS_RUNTIME_VERSION,
  WAR_ROOM_HANS_SETUP_RETRY_DELAY_MS,
  createWarRoomHansSetupRetryState,
  deferWarRoomHansSetupRetry,
  resetWarRoomHansSetupRetry,
  warRoomHansSetupRetryReady,
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
    expect(setWarRoomHansTaskPresentation(runtime, {
      visible: true,
      motionState: 'walk-service',
      route: 'service-espresso',
    })).toBe(true);
    expect(hans.visible).toBe(true);
    expect(hans.userData.warRoomHansMotionState).toBe('walk-service');
    expect(hans.userData.warRoomHansRoute).toBe('service-espresso');

    expect(setWarRoomHansTaskPresentation(runtime, {
      visible: false,
      motionState: 'idle',
      route: '',
    })).toBe(true);
    expect(hans.visible).toBe(false);
    expect(hans.userData.warRoomHansMotionState).toBe('idle');
    expect(hans.userData.warRoomHansRoute).toBe('');

    expect(releaseWarRoomHansTask(runtime, 'service-espresso')).toBe(true);
    expect(getWarRoomHansActiveTask(runtime)).toBeNull();
    expect(warRoomHansTaskAvailable(runtime, 'chore-mail')).toBe(true);
  });
  it('reintenta setup transitorio con backoff acotado y luego falla cerrado', () => {
    const retry = createWarRoomHansSetupRetryState();
    expect(warRoomHansSetupRetryReady(retry, 1000)).toBe(true);

    expect(deferWarRoomHansSetupRetry(retry, 1000)).toBe(true);
    expect(retry.attempts).toBe(1);
    expect(retry.notBefore).toBe(1000 + WAR_ROOM_HANS_SETUP_RETRY_DELAY_MS);
    expect(warRoomHansSetupRetryReady(retry, retry.notBefore - 1)).toBe(false);
    expect(warRoomHansSetupRetryReady(retry, retry.notBefore)).toBe(true);

    expect(deferWarRoomHansSetupRetry(retry, retry.notBefore)).toBe(true);
    expect(retry.attempts).toBe(2);
    expect(deferWarRoomHansSetupRetry(retry, retry.notBefore)).toBe(false);
    expect(retry.attempts).toBe(3);
    expect(warRoomHansSetupRetryReady(retry, Number.MAX_SAFE_INTEGER)).toBe(false);

    expect(resetWarRoomHansSetupRetry(retry)).toBe(true);
    expect(retry).toEqual({ attempts: 0, notBefore: 0 });
    expect(warRoomHansSetupRetryReady(retry, 0)).toBe(true);
  });
});
