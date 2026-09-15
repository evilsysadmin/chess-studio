import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { warRoomCatAmbientMotionAllowed } from './WarRoomCatDecor.js';

function roomWithHans() {
  const root = new THREE.Group();
  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  root.add(hans);
  return { root, hans };
}

describe('War Room cat ambient restraint', () => {
  it('allows the restrained idle animation while Hans is not performing a task', () => {
    const { root } = roomWithHans();
    expect(warRoomCatAmbientMotionAllowed(root, { reducedMotion: false })).toBe(true);
  });

  it('freezes the cat whenever Hans owns an active room task', () => {
    const { root, hans } = roomWithHans();
    hans.userData.warRoomHansActiveTaskKind = 'service';
    expect(warRoomCatAmbientMotionAllowed(root, { reducedMotion: false })).toBe(false);

    hans.userData.warRoomHansActiveTaskKind = 'chore';
    expect(warRoomCatAmbientMotionAllowed(root, { reducedMotion: false })).toBe(false);
  });

  it('always suppresses ambient motion for reduced-motion users', () => {
    const { root } = roomWithHans();
    expect(warRoomCatAmbientMotionAllowed(root, { reducedMotion: true })).toBe(false);
  });
});
