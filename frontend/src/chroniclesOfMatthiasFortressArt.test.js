import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_FORTRESS_STYLE,
  CHRONICLES_TACTICS_PAINTED_LIGHTING,
  CHRONICLES_TACTICS_SKYLINE_PLAN,
  applyChroniclesTacticsPaintedAtmosphere,
  buildChroniclesTacticsDistantSkyline,
  chroniclesTacticsBackdropZForScenePlan,
  installChroniclesTacticsFortressAccents,
  installChroniclesTacticsFortressBackdrop,
} from './chroniclesOfMatthiasFortressArt.js';

describe('Chronicles Tactics canonical fortress accents', () => {
  it('keeps the heraldic fortress contract stable', () => {
    expect(CHRONICLES_TACTICS_FORTRESS_STYLE).toMatchObject({
      motif: 'heraldic-fortress',
      bannerCount: 2,
      battlementCount: 7,
      skylineTowerCount: 7,
    });
    expect(CHRONICLES_TACTICS_SKYLINE_PLAN).toHaveLength(7);
    expect(Math.max(...CHRONICLES_TACTICS_SKYLINE_PLAN.map((tower) => tower.height))).toBeGreaterThan(7);
  });

  it('builds banners, battlements, buttresses and a crest without touching gameplay state', () => {
    const shrine = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial();
    const trim = new THREE.MeshStandardMaterial();
    const brass = new THREE.MeshStandardMaterial();
    wall.userData.chroniclesIsoOwned = true;
    trim.userData.chroniclesIsoOwned = true;
    brass.userData.chroniclesIsoOwned = true;

    const accents = installChroniclesTacticsFortressAccents(shrine, {
      wall,
      trim,
      brass,
      coarsePointer: false,
    });

    expect(accents?.name).toBe('chronicles-fortress-accents');
    expect(shrine.getObjectByName('chronicles-fortress-banner-0')).toBeTruthy();
    expect(shrine.getObjectByName('chronicles-fortress-banner-1')).toBeTruthy();
    expect(shrine.getObjectByName('chronicles-fortress-battlement-6')).toBeTruthy();
    expect(shrine.getObjectByName('chronicles-fortress-buttress-0')).toBeTruthy();
    expect(shrine.getObjectByName('chronicles-fortress-buttress-1')).toBeTruthy();
    expect(shrine.getObjectByName('chronicles-fortress-crest')).toBeTruthy();
  });

  it('builds a distant layered skyline and reuses it on repeated calls', () => {
    const root = new THREE.Group();
    const first = buildChroniclesTacticsDistantSkyline(root, { coarsePointer: false });
    const second = buildChroniclesTacticsDistantSkyline(root, { coarsePointer: false });

    expect(first?.name).toBe('chronicles-fortress-distant-skyline');
    expect(second).toBe(first);
    expect(root.getObjectByName('chronicles-fortress-skyline-tower-0')).toBeTruthy();
    expect(root.getObjectByName('chronicles-fortress-skyline-tower-6')).toBeTruthy();
    expect(root.getObjectByName('chronicles-fortress-skyline-bridge-1')).toBeTruthy();
    expect(root.getObjectByName('chronicles-fortress-haze-1')).toBeTruthy();
  });

  it('applies a restrained cool-fog and warm-light painted atmosphere once', () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.1);

    const first = applyChroniclesTacticsPaintedAtmosphere(scene, { coarsePointer: false });
    const second = applyChroniclesTacticsPaintedAtmosphere(scene, { coarsePointer: false });

    expect(first?.name).toBe('chronicles-fortress-painted-lighting');
    expect(second).toBe(first);
    expect(scene.fog.color.getHex()).toBe(CHRONICLES_TACTICS_PAINTED_LIGHTING.fogColor);
    expect(scene.fog.density).toBeCloseTo(CHRONICLES_TACTICS_PAINTED_LIGHTING.fogDensity, 6);
    expect(scene.getObjectByName('chronicles-fortress-cool-wash')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-fortress-warm-wash')).toBeTruthy();
  });

  it('installs one world-space backdrop and reuses it on repeated calls', () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.1);
    const first = installChroniclesTacticsFortressBackdrop(scene, { coarsePointer: true });
    const second = installChroniclesTacticsFortressBackdrop(scene, { coarsePointer: true });

    expect(first?.name).toBe('chronicles-fortress-backdrop');
    expect(first?.position.z).toBeCloseTo(-8.35, 6);
    expect(first?.getObjectByName('chronicles-fortress-distant-skyline')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-fortress-painted-lighting')).toBeTruthy();
    expect(scene.fog.density).toBeCloseTo(CHRONICLES_TACTICS_PAINTED_LIGHTING.coarseFogDensity, 6);
    expect(second).toBe(first);
    expect(scene.children.filter((child) => child.name === 'chronicles-fortress-backdrop')).toHaveLength(1);
  });

  it('pushes the backdrop beyond the north edge on large maps instead of letting skyline towers enter the battlefield', () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.1);
    const scenePlan = { width: 11, height: 11 };

    const backdrop = installChroniclesTacticsFortressBackdrop(scene, {
      coarsePointer: true,
      scenePlan,
    });

    expect(chroniclesTacticsBackdropZForScenePlan(scenePlan)).toBeCloseTo(-13.25, 6);
    expect(backdrop?.position.z).toBeCloseTo(-13.25, 6);
    expect(backdrop?.position.z).toBeLessThan(-12.25);
  });

  it('fails closed when the host is unavailable', () => {
    expect(applyChroniclesTacticsPaintedAtmosphere(null)).toBeNull();
    expect(buildChroniclesTacticsDistantSkyline(null)).toBeNull();
    expect(installChroniclesTacticsFortressAccents(null)).toBeNull();
    expect(installChroniclesTacticsFortressAccents(new THREE.Group(), {})).toBeNull();
    expect(installChroniclesTacticsFortressBackdrop(null)).toBeNull();
  });
});
