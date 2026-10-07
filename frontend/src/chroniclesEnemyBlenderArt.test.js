import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_ENEMY_AUTHORED_ART_VERSION,
  CHRONICLES_ENEMY_MATTHIAS_MODEL_PATH,
  CHRONICLES_ENEMY_PARTY_MODEL_PATH,
  applyChroniclesEnemyAuthoredVisual,
  chroniclesEnemyAuthoredSource,
} from './chroniclesEnemyBlenderArt.js';

describe('Chronicles authored enemy GLB upgrade', () => {
  it('maps all four canonical threats to existing authored models', () => {
    expect(chroniclesEnemyAuthoredSource('corrupted-pawn')).toMatchObject({ asset: 'matthias' });
    expect(chroniclesEnemyAuthoredSource('gate-jailer')).toMatchObject({ asset: 'party', memberId: 'rook' });
    expect(chroniclesEnemyAuthoredSource('spectral-bishop')).toMatchObject({ asset: 'party', memberId: 'bishop' });
    expect(chroniclesEnemyAuthoredSource('scavenger-knight')).toMatchObject({ asset: 'party', memberId: 'knight' });
    expect(chroniclesEnemyAuthoredSource('fork-stalker')).toBeNull();
    expect(CHRONICLES_ENEMY_PARTY_MODEL_PATH).toBe('models/chronicles-tactics-party.glb');
    expect(CHRONICLES_ENEMY_MATTHIAS_MODEL_PATH).toBe('models/matthias-home-canonical.glb');
  });

  it('replaces visible procedural children with an independently disposable authored clone', () => {
    const fallback = new THREE.Group();
    const lowPoly = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    fallback.add(lowPoly);

    const source = new THREE.Group();
    source.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xb8aa94 }),
    ));

    const cancel = applyChroniclesEnemyAuthoredVisual(
      fallback,
      'gate-jailer',
      source,
      { reducedMotion: true },
    );

    const authored = fallback.getObjectByName('chronicles-enemy-authored-gate-jailer');
    expect(authored).toBeTruthy();
    expect(lowPoly.visible).toBe(false);
    expect(fallback.userData.chroniclesEnemyArtSource).toBe(CHRONICLES_ENEMY_AUTHORED_ART_VERSION);
    expect(authored.children[0].geometry).not.toBe(source.children[0].geometry);
    expect(authored.children[0].material).not.toBe(source.children[0].material);

    cancel();
    expect(lowPoly.visible).toBe(true);
    expect(fallback.getObjectByName('chronicles-enemy-authored-gate-jailer')).toBeFalsy();
    expect(fallback.userData.chroniclesEnemyArtSource).toBe('procedural-fallback');

    lowPoly.geometry.dispose();
    lowPoly.material.dispose();
    source.children[0].geometry.dispose();
    source.children[0].material.dispose();
  });

  it('makes the spectral authored clone translucent and emissive without mutating its source', () => {
    const fallback = new THREE.Group();
    fallback.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));

    const source = new THREE.Group();
    const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x806d55 });
    source.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), sourceMaterial));

    const cancel = applyChroniclesEnemyAuthoredVisual(
      fallback,
      'spectral-bishop',
      source,
      { reducedMotion: true },
    );
    const authoredMesh = fallback
      .getObjectByName('chronicles-enemy-authored-spectral-bishop')
      .children[0];

    expect(authoredMesh.material.transparent).toBe(true);
    expect(authoredMesh.material.opacity).toBeLessThanOrEqual(0.82);
    expect(authoredMesh.material.emissiveIntensity).toBeGreaterThanOrEqual(0.55);
    expect(sourceMaterial.transparent).toBe(false);

    cancel();
    source.children[0].geometry.dispose();
    sourceMaterial.dispose();
    fallback.children.forEach((node) => {
      node.geometry?.dispose?.();
      node.material?.dispose?.();
    });
  });
});
