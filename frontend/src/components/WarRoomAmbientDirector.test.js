import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installWarRoomCatAmbient } from './WarRoomCatAmbient.js';
import { isWarRoomHansAmbientBusy, resolveWarRoomAmbientActor } from './WarRoomAmbientDirector.js';

function room({ hansPhase = 'idle', hansVisible = true, withCat = false } = {}) {
  const root = new THREE.Group();
  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = hansVisible;
  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  driver.userData.warRoomHansPhase = hansPhase;
  root.add(hans, driver);
  if (withCat) installWarRoomCatAmbient(root, { random: () => 0, now: 0 });
  return { root, hans, driver };
}

describe('WarRoomAmbientDirector', () => {
  it('prioritizes Hans over cat and Matthias while he is active', () => {
    const { root } = room({ hansPhase: 'fire-dimming', withCat: true });
    expect(isWarRoomHansAmbientBusy(root)).toBe(true);
    expect(resolveWarRoomAmbientActor(root)).toBe('hans');
  });

  it('gives the cat the room when Hans is idle', () => {
    const { root } = room({ hansPhase: 'idle', withCat: true });
    expect(resolveWarRoomAmbientActor(root)).toBe('cat');
  });

  it('lets Matthias own sparse idle acting only when the room is otherwise quiet', () => {
    const { root } = room({ hansPhase: 'idle', withCat: false });
    expect(resolveWarRoomAmbientActor(root)).toBe('matthias');
  });

  it('reduced motion disables ambient actor choreography', () => {
    const { root } = room({ hansPhase: 'fire-dimming', withCat: true });
    expect(resolveWarRoomAmbientActor(root, { reducedMotion: true })).toBe('none');
  });

  it('treats a task or route as Hans activity even if the phase says idle', () => {
    const { root, hans } = room({ hansPhase: 'idle' });
    hans.userData.warRoomHansActiveTask = 'polish-armor';
    expect(isWarRoomHansAmbientBusy(root)).toBe(true);
    hans.userData.warRoomHansActiveTask = '';
    hans.userData.warRoomHansRoute = 'entry';
    expect(isWarRoomHansAmbientBusy(root)).toBe(true);
  });
});
