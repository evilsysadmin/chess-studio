import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  ensureMatthiasHomeEnvironmentRoot,
  ensureMatthiasHomeInteractionAnchor,
  findMatthiasHomeInteractionNode,
  MATTHIAS_HOME_INTERACTION_RESOURCE_OWNER_VERSION,
  MATTHIAS_HOME_INTERACTION_SCENE_VERSION,
  registerMatthiasHomeEnvironmentResources,
  stageMatthiasHomeEnvironmentNode,
} from './matthiasHomeInteractionScene.js';

function worldPosition(node) {
  const target = new THREE.Vector3();
  node.getWorldPosition(target);
  return target;
}

describe('Matthias Home interaction scene contract', () => {
  it('mantiene el entorno fijo aunque el actor se mueva y un rig intente reescribir el prop', () => {
    const host = new THREE.Scene();
    const actorRoot = new THREE.Group();
    const activityRoot = new THREE.Group();
    actorRoot.add(activityRoot);
    host.add(actorRoot);
    const rig = { root: actorRoot, activityRig: { root: activityRoot } };

    actorRoot.position.set(.2, -.1, .15);
    activityRoot.position.set(0, -.06, .02);

    const cup = new THREE.Group();
    cup.name = 'test-campaign-cup';
    activityRoot.add(cup);

    stageMatthiasHomeEnvironmentNode(rig, cup, {
      reference: activityRoot,
      position: [.48, -.48, .77],
      rotation: [.01, -.05, -.04],
      scale: .8,
      stage: 'side-table-cup',
      interaction: 'coffee',
    });

    const environmentRoot = ensureMatthiasHomeEnvironmentRoot(rig);
    expect(environmentRoot.parent).toBe(host);
    expect(cup.parent).toBe(environmentRoot);
    expect(cup.userData.homePropKind).toBe('environment');
    expect(cup.userData.homeAttachmentPolicy).toBe('never-hand');
    expect(environmentRoot.userData.interactionSceneVersion).toBe(MATTHIAS_HOME_INTERACTION_SCENE_VERSION);

    host.updateMatrixWorld(true);
    const before = worldPosition(cup);

    actorRoot.position.x += .7;
    actorRoot.position.y += .3;
    actorRoot.rotation.z = .25;
    cup.position.set(99, 99, 99);

    stageMatthiasHomeEnvironmentNode(rig, cup, {
      reference: activityRoot,
      position: [.48, -.48, .77],
      rotation: [.01, -.05, -.04],
      scale: .8,
      stage: 'side-table-cup',
      interaction: 'coffee',
    });
    host.updateMatrixWorld(true);
    const after = worldPosition(cup);

    expect(after.distanceTo(before)).toBeLessThan(1e-6);
    expect(findMatthiasHomeInteractionNode(rig, 'test-campaign-cup')).toBe(cup);
  });

  it('crea anchors explícitos y registra recursos detached para el dispose normal del actor', () => {
    const host = new THREE.Scene();
    const actorRoot = new THREE.Group();
    const activityRoot = new THREE.Group();
    actorRoot.add(activityRoot);
    host.add(actorRoot);
    const rig = { root: actorRoot, activityRig: { root: activityRoot } };
    const environmentRoot = ensureMatthiasHomeEnvironmentRoot(rig);

    const desk = new THREE.Group();
    environmentRoot.add(desk);
    const anchor = ensureMatthiasHomeInteractionAnchor(desk, {
      name: 'coffee-interaction-anchor',
      interaction: 'coffee',
      position: [.1, .2, .3],
      approachRadius: .16,
    });

    expect(anchor.userData.role).toBe('actor-anchor');
    expect(anchor.userData.actor).toBe('matthias');
    expect(anchor.userData.approachRadius).toBe(.16);
    expect(anchor.userData.interactionSceneVersion).toBe(MATTHIAS_HOME_INTERACTION_SCENE_VERSION);

    const disposeSpy = vi.fn();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.name = 'detached-desk-mesh';
    mesh.geometry.dispose = disposeSpy;
    desk.add(mesh);

    expect(registerMatthiasHomeEnvironmentResources(rig, desk)).toBe(1);
    expect(registerMatthiasHomeEnvironmentResources(rig, desk)).toBe(0);
    expect(rig.homeInteractionResourceOwner.parent).toBe(actorRoot);
    expect(rig.homeInteractionResourceOwner.visible).toBe(false);
    expect(rig.homeInteractionResourceOwner.userData.resourceOwnerVersion)
      .toBe(MATTHIAS_HOME_INTERACTION_RESOURCE_OWNER_VERSION);

    const token = rig.homeInteractionResourceOwner.getObjectByName('home-interaction-resource-owner');
    expect(token).toBeTruthy();
    expect(token.type).toBe('Object3D');
    expect(token.isMesh).not.toBe(true);
    expect(token.geometry).toBe(mesh.geometry);

    // Replica el dispose existente de MatthiasPawn3D: solo atraviesa actorRoot.
    actorRoot.traverse((node) => node.geometry?.dispose?.());
    expect(disposeSpy).toHaveBeenCalledOnce();
    expect(environmentRoot.parent).toBe(host);
  });
});
