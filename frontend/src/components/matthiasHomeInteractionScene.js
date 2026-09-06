import * as THREE from 'three';

export const MATTHIAS_HOME_INTERACTION_SCENE_VERSION = 'home-interaction-scene-v2-world-anchored';
export const MATTHIAS_HOME_INTERACTION_RESOURCE_OWNER_VERSION = 'home-interaction-resource-owner-v1';

const RESOURCE_NODES = new WeakMap();

function asScaleVector(scale = 1) {
  if (Array.isArray(scale)) return new THREE.Vector3(...scale);
  const scalar = Number(scale);
  const safe = Number.isFinite(scalar) ? scalar : 1;
  return new THREE.Vector3(safe, safe, safe);
}

function serializeTransform(node) {
  return {
    position: node.position.toArray(),
    quaternion: node.quaternion.toArray(),
    scale: node.scale.toArray(),
  };
}

function restoreTransform(node, snapshot) {
  if (!node || !snapshot) return false;
  node.position.fromArray(snapshot.position);
  node.quaternion.fromArray(snapshot.quaternion);
  node.scale.fromArray(snapshot.scale);
  node.updateMatrix();
  return true;
}

function ensureResourceOwnerRoot(rig) {
  const actorRoot = rig?.root || null;
  if (!actorRoot) return null;
  let ownerRoot = rig.homeInteractionResourceOwner || null;
  if (!ownerRoot) {
    ownerRoot = new THREE.Group();
    ownerRoot.name = 'home-interaction-resource-ownership';
    ownerRoot.visible = false;
    ownerRoot.userData.resourceOwnerVersion = MATTHIAS_HOME_INTERACTION_RESOURCE_OWNER_VERSION;
    actorRoot.add(ownerRoot);
    rig.homeInteractionResourceOwner = ownerRoot;
  }
  return ownerRoot;
}

export function registerMatthiasHomeEnvironmentResources(rig, node) {
  if (!rig || !node) return 0;
  const ownerRoot = ensureResourceOwnerRoot(rig);
  if (!ownerRoot) return 0;
  let owned = RESOURCE_NODES.get(rig);
  if (!owned) {
    owned = new WeakSet();
    RESOURCE_NODES.set(rig, owned);
  }

  let registered = 0;
  node.traverse((resourceNode) => {
    const materials = Array.isArray(resourceNode.material)
      ? resourceNode.material.filter(Boolean)
      : resourceNode.material ? [resourceNode.material] : [];
    if ((!resourceNode.geometry && materials.length === 0) || owned.has(resourceNode)) return;
    owned.add(resourceNode);

    // Plain Object3D: it never renders. It only makes the existing actor dispose
    // traversal see resources that physically live in a sibling environment root.
    const token = new THREE.Object3D();
    token.name = 'home-interaction-resource-owner';
    token.userData.resourceOwnerVersion = MATTHIAS_HOME_INTERACTION_RESOURCE_OWNER_VERSION;
    token.userData.sourceName = resourceNode.name || '';
    if (resourceNode.geometry) token.geometry = resourceNode.geometry;
    if (materials.length) token.material = Array.isArray(resourceNode.material)
      ? resourceNode.material
      : resourceNode.material;
    ownerRoot.add(token);
    registered += 1;
  });
  return registered;
}

export function ensureMatthiasHomeEnvironmentRoot(rig) {
  if (!rig) return null;
  let environmentRoot = rig.homeInteractionEnvironment || null;
  if (!environmentRoot) {
    environmentRoot = new THREE.Group();
    environmentRoot.name = 'home-interaction-environment-root';
    rig.homeInteractionEnvironment = environmentRoot;
  }

  environmentRoot.userData.interactionSceneVersion = MATTHIAS_HOME_INTERACTION_SCENE_VERSION;
  environmentRoot.userData.relationship = 'world-anchored-environment';
  environmentRoot.userData.homePropKind = 'environment-root';
  environmentRoot.userData.homeAttachmentPolicy = 'never-hand';

  const host = rig.root?.parent || null;
  if (host && environmentRoot.parent !== host) {
    environmentRoot.removeFromParent();
    host.add(environmentRoot);
  }
  return environmentRoot;
}

export function markMatthiasHomeEnvironmentNode(node, {
  kind = 'environment',
  attachmentPolicy = 'never-hand',
  interaction = '',
  stage = '',
} = {}) {
  if (!node) return null;
  node.userData.homePropKind = kind;
  node.userData.homeAttachmentPolicy = attachmentPolicy;
  node.userData.interactionSceneVersion = MATTHIAS_HOME_INTERACTION_SCENE_VERSION;
  if (interaction) node.userData.homeInteraction = interaction;
  if (stage) node.userData.homeEnvironmentStage = stage;
  return node;
}

export function ensureMatthiasHomeInteractionAnchor(owner, {
  name,
  interaction,
  position = [0, 0, 0],
  approachRadius = .18,
  actor = 'matthias',
} = {}) {
  if (!owner || !name) return null;
  let anchor = owner.getObjectByName?.(name) || null;
  if (!anchor) {
    anchor = new THREE.Object3D();
    anchor.name = name;
    owner.add(anchor);
  }
  anchor.position.set(...position);
  anchor.userData.interaction = interaction || name;
  anchor.userData.role = 'actor-anchor';
  anchor.userData.actor = actor;
  anchor.userData.approachRadius = Number(approachRadius) || .18;
  anchor.userData.interactionSceneVersion = MATTHIAS_HOME_INTERACTION_SCENE_VERSION;
  return anchor;
}

export function worldAnchorMatthiasHomeNode(rig, node) {
  const environmentRoot = ensureMatthiasHomeEnvironmentRoot(rig);
  if (!environmentRoot || !node) return environmentRoot;
  registerMatthiasHomeEnvironmentResources(rig, node);
  if (node.parent === environmentRoot) return environmentRoot;

  rig.root?.updateMatrixWorld?.(true);
  node.updateMatrixWorld(true);
  environmentRoot.updateMatrixWorld(true);
  environmentRoot.attach(node);
  markMatthiasHomeEnvironmentNode(node);
  return environmentRoot;
}

export function stageMatthiasHomeEnvironmentNode(rig, node, {
  reference = rig?.activityRig?.root || rig?.root || null,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  stage = 'default',
  interaction = '',
  kind = 'environment',
  attachmentPolicy = 'never-hand',
} = {}) {
  if (!rig || !node || !reference) return null;
  const environmentRoot = ensureMatthiasHomeEnvironmentRoot(rig);
  if (!environmentRoot) return null;

  registerMatthiasHomeEnvironmentResources(rig, node);
  markMatthiasHomeEnvironmentNode(node, { kind, attachmentPolicy, interaction, stage });
  const anchorKey = `${stage}|${interaction || 'environment'}`;
  const anchors = node.userData.homeEnvironmentAnchors || (node.userData.homeEnvironmentAnchors = {});

  if (node.parent !== environmentRoot) environmentRoot.add(node);

  const cached = anchors[anchorKey];
  if (cached) {
    restoreTransform(node, cached);
    return node;
  }

  reference.updateMatrixWorld(true);
  environmentRoot.updateMatrixWorld(true);

  const localPosition = new THREE.Vector3(...position);
  const localQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
  const localScale = asScaleVector(scale);
  const localMatrix = new THREE.Matrix4().compose(localPosition, localQuaternion, localScale);
  const targetWorld = new THREE.Matrix4().multiplyMatrices(reference.matrixWorld, localMatrix);
  const targetLocal = new THREE.Matrix4().multiplyMatrices(
    new THREE.Matrix4().copy(environmentRoot.matrixWorld).invert(),
    targetWorld,
  );
  targetLocal.decompose(node.position, node.quaternion, node.scale);
  node.updateMatrix();
  anchors[anchorKey] = serializeTransform(node);
  return node;
}

export function restoreMatthiasHomeEnvironmentStage(node, stage, interaction = 'environment') {
  const key = `${stage}|${interaction}`;
  return restoreTransform(node, node?.userData?.homeEnvironmentAnchors?.[key]);
}

export function findMatthiasHomeInteractionNode(rig, name) {
  if (!rig || !name) return null;
  return rig.homeInteractionEnvironment?.getObjectByName?.(name)
    || rig.root?.getObjectByName?.(name)
    || null;
}

export function rejoinMatthiasHomeEnvironmentForDispose(rig) {
  const environmentRoot = rig?.homeInteractionEnvironment || null;
  const actorRoot = rig?.root || null;
  if (!environmentRoot || !actorRoot || environmentRoot.parent === actorRoot) return environmentRoot;

  environmentRoot.updateMatrixWorld(true);
  actorRoot.updateMatrixWorld(true);
  actorRoot.attach(environmentRoot);
  environmentRoot.userData.relationship = 'dispose-owned-by-actor';
  return environmentRoot;
}

export function disposeMatthiasHomeInteractionEnvironment(rig) {
  const environmentRoot = rig?.homeInteractionEnvironment || null;
  if (!environmentRoot) return;
  const geometries = new Set();
  const materials = new Set();
  environmentRoot.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    const entries = Array.isArray(node.material) ? node.material : [node.material];
    entries.forEach((material) => { if (material) materials.add(material); });
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
  environmentRoot.removeFromParent();
  if (rig) rig.homeInteractionEnvironment = null;
}
