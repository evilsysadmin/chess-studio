import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { upgradeWarRoomHansEspressoVisuals } from './WarRoomHansHandPropGuard.js';

describe('Hans delivered espresso desk height', () => {
  it('widens the cup presentation without scaling its vertical desk offset', () => {
    const root = new THREE.Group();
    const hans = new THREE.Group();
    root.add(hans);
    const actor = { hans, body: {} };

    const deskArt = new THREE.Group();
    const drawer = new THREE.Group();
    drawer.name = 'war-room-command-desk-drawer';
    drawer.position.z = 0.405;
    deskArt.add(drawer);

    const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xe5dfd1 });
    const delivered = new THREE.Group();
    delivered.name = 'war-room-hans-delivered-espresso';
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.018, 18), porcelain);
    saucer.position.y = 1.145;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.068, 0.12, 16), porcelain);
    cup.position.y = 1.215;
    delivered.add(saucer, cup);
    deskArt.add(delivered);
    root.add(deskArt);

    expect(upgradeWarRoomHansEspressoVisuals(root, actor)).toBe(1);
    expect(delivered.scale.x).toBeCloseTo(1.28, 8);
    expect(delivered.scale.y).toBe(1);
    expect(delivered.scale.z).toBeCloseTo(1.28, 8);
    expect(cup.position.y).toBeCloseTo(1.215, 8);
    expect(delivered.position.z).toBeCloseTo(0.32, 8);
  });
});
