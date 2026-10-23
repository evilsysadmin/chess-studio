import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  applyWarRoomKeyLightGrade,
  applyWarRoomWarmFillGrade,
  warRoomKeyLightPose,
  warRoomWarmFillPose,
} from './WarRoom3DMotion.js';

function setup(whiteSide = true) {
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xffe1aa, 1.6);
  key.position.set(-9, 8, whiteSide ? 2 : -2);
  const warm = new THREE.PointLight(0xffa449, 1.8);
  warm.position.set(1, 4, 4);
  scene.add(key, warm);
  const keyPoseWrites = vi.spyOn(key.position, 'set');
  const keyColorWrites = vi.spyOn(key.color, 'setHex');
  const warmPoseWrites = vi.spyOn(warm.position, 'set');
  const warmColorWrites = vi.spyOn(warm.color, 'setHex');
  return { scene, key, warm, keyPoseWrites, keyColorWrites, warmPoseWrites, warmColorWrites };
}

describe('War Room fixed-light grading render hot path', () => {
  it.each([true, false])('writes each authored light pose/color once and skips identical paints (whiteSide=%s)', (whiteSide) => {
    const p = setup(whiteSide);
    const keyPose = warRoomKeyLightPose({ whiteSide });
    const warmPose = warRoomWarmFillPose({ whiteSide });
    expect(applyWarRoomKeyLightGrade(p.scene)).toBe(p.key);
    expect(applyWarRoomWarmFillGrade(p.scene)).toBe(p.warm);
    expect(p.key.position).toMatchObject(keyPose);
    expect(p.warm.position).toMatchObject(warmPose);
    expect(p.key.color.getHex()).toBe(0xffd8ac);
    expect(p.warm.color.getHex()).toBe(0xffb45f);
    expect(p.keyPoseWrites).toHaveBeenCalledTimes(1);
    expect(p.keyColorWrites).toHaveBeenCalledTimes(1);
    expect(p.warmPoseWrites).toHaveBeenCalledTimes(1);
    expect(p.warmColorWrites).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 30; i += 1) {
      applyWarRoomKeyLightGrade(p.scene);
      applyWarRoomWarmFillGrade(p.scene);
    }
    expect(p.keyPoseWrites).toHaveBeenCalledTimes(1);
    expect(p.keyColorWrites).toHaveBeenCalledTimes(1);
    expect(p.warmPoseWrites).toHaveBeenCalledTimes(1);
    expect(p.warmColorWrites).toHaveBeenCalledTimes(1);
    expect(p.scene.userData.warRoomRankSeparation).toBe('lateral-graze-ranks-v3');
    expect(p.scene.userData.warRoomKeyLightPosition).toEqual(keyPose);
    expect(p.scene.userData.warRoomWarmFillPosition).toEqual(warmPose);
  });

  it('repairs externally changed transforms/colors without introducing a stale cache', () => {
    const p = setup(true);
    applyWarRoomKeyLightGrade(p.scene);
    applyWarRoomWarmFillGrade(p.scene);
    p.key.position.x = -11;
    p.key.color.setRGB(1, 0, 0);
    p.warm.position.y = 9;
    p.warm.color.setRGB(0, 1, 0);
    applyWarRoomKeyLightGrade(p.scene);
    applyWarRoomWarmFillGrade(p.scene);
    expect(p.key.position).toMatchObject(warRoomKeyLightPose({ whiteSide: true }));
    expect(p.warm.position).toMatchObject(warRoomWarmFillPose({ whiteSide: true }));
    expect(p.key.color.getHex()).toBe(0xffd8ac);
    expect(p.warm.color.getHex()).toBe(0xffb45f);
    expect(p.keyPoseWrites).toHaveBeenCalledTimes(2);
    expect(p.warmPoseWrites).toHaveBeenCalledTimes(2);
    expect(p.keyColorWrites).toHaveBeenCalledTimes(2);
    expect(p.warmColorWrites).toHaveBeenCalledTimes(2);
  });
});
