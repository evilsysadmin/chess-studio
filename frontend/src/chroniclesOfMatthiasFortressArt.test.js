import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_FORTRESS_STYLE,
  installChroniclesTacticsFortressAccents,
  installChroniclesTacticsFortressBackdrop,
} from './chroniclesOfMatthiasFortressArt.js';

describe('Chronicles Tactics canonical fortress accents', () => {
  it('keeps the heraldic fortress contract stable', () => {
    expect(CHRONICLES_TACTICS_FORTRESS_STYLE).toMatchObject({
      motif: 'heraldic-fortress',
      bannerCount: 2,
      battlementCount: 7,
    });
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

  it('installs one world-space backdrop and reuses it on repeated calls', () => {
    const scene = new THREE.Scene();
    const first = installChroniclesTacticsFortressBackdrop(scene, { coarsePointer: true });
    const second = installChroniclesTacticsFortressBackdrop(scene, { coarsePointer: true });

    expect(first?.name).toBe('chronicles-fortress-backdrop');
    expect(first?.position.z).toBeCloseTo(-8.35, 6);
    expect(second).toBe(first);
    expect(scene.children.filter((child) => child.name === 'chronicles-fortress-backdrop')).toHaveLength(1);
  });

  it('fails closed when the host is unavailable', () => {
    expect(installChroniclesTacticsFortressAccents(null)).toBeNull();
    expect(installChroniclesTacticsFortressAccents(new THREE.Group(), {})).toBeNull();
    expect(installChroniclesTacticsFortressBackdrop(null)).toBeNull();
  });
});
