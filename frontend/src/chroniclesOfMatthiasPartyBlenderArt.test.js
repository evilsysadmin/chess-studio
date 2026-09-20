import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_PARTY_ASSET_VERSION,
  CHRONICLES_TACTICS_PARTY_LEGACY_MODEL_PATH,
  CHRONICLES_TACTICS_PARTY_MEMBERS,
  CHRONICLES_TACTICS_PARTY_MODEL_URL,
  CHRONICLES_TACTICS_PARTY_R2_ASSET_ID,
  chroniclesTacticsPartyIdleName,
  chroniclesTacticsPartyRootName,
  configureChroniclesTacticsPartyVisual,
  installChroniclesTacticsPartyLoadout,
} from './chroniclesOfMatthiasPartyBlenderArt.js';

describe('Chronicles Tactics real Blender party runtime contract', () => {
  it('uses the canonical v8 runtime GLB through the reviewed R2 logical id', () => {
    expect(CHRONICLES_TACTICS_PARTY_R2_ASSET_ID).toBe('chronicles.tactics.party.runtime');
    expect(CHRONICLES_TACTICS_PARTY_LEGACY_MODEL_PATH).toBe('models/chronicles-tactics-party.glb');
    expect(CHRONICLES_TACTICS_PARTY_MODEL_URL).toMatch(/chronicles-tactics-party.*\.glb$/);
    expect(CHRONICLES_TACTICS_PARTY_MEMBERS).toEqual(['rook', 'bishop', 'knight']);
    expect(CHRONICLES_TACTICS_PARTY_ASSET_VERSION).toBe('chronicles-humanoid-party-v8');
  });

  it('maps every persistent member id to its Blender root and idle action contract', () => {
    expect(CHRONICLES_TACTICS_PARTY_MEMBERS.map(chroniclesTacticsPartyRootName)).toEqual([
      'ChroniclesParty__rook',
      'ChroniclesParty__bishop',
      'ChroniclesParty__knight',
    ]);
    expect(CHRONICLES_TACTICS_PARTY_MEMBERS.map(chroniclesTacticsPartyIdleName)).toEqual([
      'Idle.rook',
      'Idle.bishop',
      'Idle.knight',
    ]);
  });

  it('preserves authored GLB rotation and scale while tactical placement owns position', () => {
    const root = new THREE.Group();
    root.position.set(4, 5, 6);
    root.rotation.set(0.42, -0.18, 0.11);
    root.scale.set(0.84, 1.12, 0.93);
    const authoredQuaternion = root.quaternion.clone();
    const authoredScale = root.scale.clone();

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
    root.add(mesh);

    configureChroniclesTacticsPartyVisual(root, { coarsePointer: false });

    expect(root.position.toArray()).toEqual([0, 0, 0]);
    expect(root.quaternion.angleTo(authoredQuaternion)).toBeLessThan(1e-8);
    expect(root.scale.toArray()).toEqual(authoredScale.toArray());
    expect(root.userData.chroniclesAuthoredTransformPreserved).toBe(true);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);

    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it('uses the canonical GLB embedded kit without stacking procedural armour on top', () => {
    const memberRoot = new THREE.Group();
    const visual = new THREE.Group();
    memberRoot.add(visual);

    const cancel = installChroniclesTacticsPartyLoadout(memberRoot, visual, 'knight');

    expect(visual.userData.chroniclesLoadoutSource).toBe('embedded-glb');
    expect(visual.getObjectByName('chronicles-default-loadout-knight')).toBeFalsy();
    expect(memberRoot.getObjectByName('chronicles-default-loadout-knight')).toBeFalsy();

    cancel();
    expect(visual.userData.chroniclesLoadoutSource).toBe('embedded-glb');
  });

  it('keeps the procedural kit available for non-authored fallback visuals', () => {
    const memberRoot = new THREE.Group();

    const cancel = installChroniclesTacticsPartyLoadout(memberRoot, null, 'rook');
    const loadout = memberRoot.getObjectByName('chronicles-default-loadout-rook');

    expect(memberRoot.userData.chroniclesLoadoutSource).toBe('procedural-fallback');
    expect(loadout).toBeTruthy();

    cancel();
    expect(memberRoot.getObjectByName('chronicles-default-loadout-rook')).toBeFalsy();
  });
});
