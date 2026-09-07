import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_BOARD_LIGHTING_VERSION,
  installWarRoomBoardReadabilityLights,
  warRoomBoardReadabilityProfile,
} from './WarRoomBoardLighting.js';

describe('WarRoomBoardLighting', () => {
  it('adds two soft shadowless desktop fills without changing global exposure', () => {
    const scene = new THREE.Scene();
    const installed = installWarRoomBoardReadabilityLights(scene, { whiteSide: true });

    expect(installed).toBeTruthy();
    expect(installed.profile.perceivedFillLift).toBeCloseTo(1.22, 2);
    expect(installed.overhead).toBeInstanceOf(THREE.SpotLight);
    expect(installed.warmSide).toBeInstanceOf(THREE.SpotLight);
    expect(installed.overhead.castShadow).toBe(false);
    expect(installed.warmSide.castShadow).toBe(false);
    expect(installed.overhead.intensity).toBeGreaterThan(installed.warmSide.intensity * 3);
    expect(installed.overhead.target).toBe(installed.target);
    expect(installed.warmSide.target).toBe(installed.target);
    expect(scene.userData.warRoomBoardLighting).toBe(WAR_ROOM_BOARD_LIGHTING_VERSION);
    expect(scene.userData.warRoomBoardPerceivedFillLift).toBeCloseTo(1.22, 2);
  });

  it('keeps the warm side fill on the camera-facing side after board orientation flips', () => {
    const whiteScene = new THREE.Scene();
    const blackScene = new THREE.Scene();
    const white = installWarRoomBoardReadabilityLights(whiteScene, { whiteSide: true });
    const black = installWarRoomBoardReadabilityLights(blackScene, { whiteSide: false });

    expect(white.warmSide.position.z).toBeGreaterThan(0);
    expect(black.warmSide.position.z).toBeLessThan(0);
    expect(Math.abs(white.warmSide.position.z)).toBe(Math.abs(black.warmSide.position.z));
  });

  it('does not stack duplicate lights when installation is requested twice', () => {
    const scene = new THREE.Scene();
    const first = installWarRoomBoardReadabilityLights(scene);
    const second = installWarRoomBoardReadabilityLights(scene);
    const lights = [];
    scene.traverse((object) => {
      if (object.isLight) lights.push(object);
    });

    expect(second).toBe(first);
    expect(lights).toHaveLength(2);
  });

  it('leaves coarse-pointer/mobile lighting untouched because it already has the brighter profile', () => {
    const scene = new THREE.Scene();

    expect(warRoomBoardReadabilityProfile({ coarsePointer: true })).toBeNull();
    expect(installWarRoomBoardReadabilityLights(scene, { coarsePointer: true })).toBeNull();
    expect(scene.children).toHaveLength(0);
  });
});
