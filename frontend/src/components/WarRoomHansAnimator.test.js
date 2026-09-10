import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  moveWarRoomHansToward,
  WAR_ROOM_HANS_ANIMATOR_VERSION,
} from './WarRoomHansAnimator.js';

describe('War Room Hans animator', () => {
  it('owns horizontal locomotion without overriding rendered grounding', () => {
    const hans = new THREE.Group();
    hans.position.set(4, -0.612, 4);
    const target = new THREE.Vector3(1, -0.34, 1);
    const groundedY = hans.position.y;

    const motion = moveWarRoomHansToward(hans, target, 0.5);

    expect(WAR_ROOM_HANS_ANIMATOR_VERSION).toContain('body-owner');
    expect(motion.blocked).toBe(false);
    expect(motion.travelled).toBeCloseTo(0.5, 6);
    expect(hans.position.x).toBeLessThan(4);
    expect(hans.position.z).toBeLessThan(4);
    expect(hans.position.y).toBeCloseTo(groundedY, 6);
  });
});
