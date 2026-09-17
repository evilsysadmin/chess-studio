import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { installChroniclesDefaultLoadoutArt } from './chroniclesOfMatthiasPartyEquipmentArt.js';

const MATTHIAS_MODEL_URL = `${import.meta.env.BASE_URL}models/matthias-home-canonical.glb`;

function disposeMaterial(material) {
  if (!material) return;
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((entry) => {
    Object.values(entry || {}).forEach((value) => value?.isTexture && value.dispose?.());
    entry?.dispose?.();
  });
}

function disposeModel(root) {
  root?.traverse?.((node) => {
    node.geometry?.dispose?.();
    disposeMaterial(node.material);
  });
}

function premiumMaterial(color, options = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.64,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.44,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
  material.userData.chroniclesOwnedMaterial = true;
  return material;
}

function addDetail(root, geometry, material, position, name, rotation = [0, 0, 0], scale = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function buildRookBackDetail({ coarsePointer }) {
  const root = new THREE.Group();
  root.name = 'chronicles-rook-premium-back-detail';
  const cloth = premiumMaterial(0x28343d, { roughness: 0.8 });
  const leather = premiumMaterial(0x49301f, { roughness: 0.84 });
  const steel = premiumMaterial(0x899399, { metalness: 0.72, roughness: 0.3, clearcoat: 0.18 });
  const brass = premiumMaterial(0x9d7430, { metalness: 0.75, roughness: 0.32 });
  const segments = coarsePointer ? 12 : 20;

  addDetail(root, new THREE.BoxGeometry(0.5, 0.54, 0.055), cloth, [0, 0.77, -0.315], 'hildegard-back-tabard');
  addDetail(root, new THREE.BoxGeometry(0.09, 0.72, 0.035), leather, [-0.14, 0.88, -0.36], 'hildegard-back-strap-left', [0, 0, -0.4]);
  addDetail(root, new THREE.BoxGeometry(0.09, 0.72, 0.035), leather, [0.14, 0.88, -0.36], 'hildegard-back-strap-right', [0, 0, 0.4]);
  addDetail(root, new THREE.CylinderGeometry(0.24, 0.28, 0.075, segments), steel, [0, 0.94, -0.39], 'hildegard-backplate', [Math.PI / 2, 0, 0]);
  addDetail(root, new THREE.TorusGeometry(0.18, 0.025, 8, segments), brass, [0, 0.94, -0.435], 'hildegard-backplate-ring');
  addDetail(root, new THREE.BoxGeometry(0.13, 0.13, 0.025), brass, [0, 0.94, -0.462], 'hildegard-backplate-mark', [0, 0, Math.PI / 4]);
  return root;
}

function buildBishopBackDetail({ coarsePointer }) {
  const root = new THREE.Group();
  root.name = 'chronicles-bishop-premium-back-detail';
  const robe = premiumMaterial(0x253b35, { roughness: 0.76 });
  const trim = premiumMaterial(0x94723b, { metalness: 0.18, roughness: 0.54 });
  const leather = premiumMaterial(0x493421, { roughness: 0.82 });
  const rune = premiumMaterial(0xd4ad5e, {
    metalness: 0.48,
    roughness: 0.32,
    emissive: 0x7f4715,
    emissiveIntensity: coarsePointer ? 0.45 : 0.7,
  });
  const segments = coarsePointer ? 12 : 22;

  addDetail(root, new THREE.SphereGeometry(0.32, segments, Math.max(8, Math.floor(segments / 2))), robe, [0, 1.14, -0.15], 'aziz-back-mantle', [0, 0, 0], [1.05, 0.46, 0.55]);
  addDetail(root, new THREE.BoxGeometry(0.11, 0.74, 0.035), trim, [-0.11, 0.87, -0.31], 'aziz-back-sash', [0, 0, -0.48]);
  addDetail(root, new THREE.CylinderGeometry(0.055, 0.055, 0.56, 10), leather, [0.31, 0.82, -0.27], 'aziz-scroll-case', [0, 0, 0.16]);
  addDetail(root, new THREE.CircleGeometry(0.13, segments), rune, [0, 0.84, -0.345], 'aziz-back-rune', [0, Math.PI, 0]);
  addDetail(root, new THREE.TorusGeometry(0.15, 0.018, 6, segments), trim, [0, 0.84, -0.354], 'aziz-back-rune-ring');
  return root;
}

function buildKnightBackDetail({ coarsePointer }) {
  const root = new THREE.Group();
  root.name = 'chronicles-knight-premium-back-detail';
  const leather = premiumMaterial(0x4a2c18, { roughness: 0.86 });
  const darkLeather = premiumMaterial(0x21150f, { roughness: 0.9 });
  const blanket = premiumMaterial(0x5f4939, { roughness: 0.88 });
  const copper = premiumMaterial(0x8f572e, { metalness: 0.58, roughness: 0.38 });
  const segments = coarsePointer ? 12 : 20;

  addDetail(root, new THREE.BoxGeometry(0.54, 0.34, 0.075), leather, [0, 0.67, -0.31], 'faust-rear-pack');
  addDetail(root, new THREE.BoxGeometry(0.055, 0.78, 0.035), darkLeather, [-0.18, 0.8, -0.36], 'faust-harness-left', [0, 0, -0.22]);
  addDetail(root, new THREE.BoxGeometry(0.055, 0.78, 0.035), darkLeather, [0.18, 0.8, -0.36], 'faust-harness-right', [0, 0, 0.22]);
  addDetail(root, new THREE.CylinderGeometry(0.11, 0.11, 0.58, segments), blanket, [0, 1.02, -0.34], 'faust-bedroll', [0, 0, Math.PI / 2]);
  addDetail(root, new THREE.TorusGeometry(0.14, 0.024, 7, segments), copper, [-0.27, 0.69, -0.39], 'faust-copper-kit', [Math.PI / 2, 0, 0]);
  addDetail(root, new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), copper, [0.29, 0.73, -0.39], 'faust-rear-tool', [0, 0, 0.18]);
  return root;
}

const PARTY_BACK_BUILDERS = Object.freeze({
  rook: buildRookBackDetail,
  bishop: buildBishopBackDetail,
  knight: buildKnightBackDetail,
});

export const CHRONICLES_PREMIUM_BACK_DETAIL_NAMES = Object.freeze({
  rook: Object.freeze(['hildegard-back-tabard', 'hildegard-backplate', 'hildegard-backplate-mark']),
  bishop: Object.freeze(['aziz-back-mantle', 'aziz-back-sash', 'aziz-back-rune']),
  knight: Object.freeze(['faust-rear-pack', 'faust-bedroll', 'faust-copper-kit']),
});

export function installChroniclesPartyFallbackDetails(
  partyRoot,
  { coarsePointer = false, memberIds = null } = {},
) {
  if (!partyRoot) return () => {};
  let cancelled = false;
  const installed = [];
  const requestedIds = memberIds ? new Set(memberIds) : null;

  Promise.resolve().then(() => {
    if (cancelled) return;
    Object.entries(PARTY_BACK_BUILDERS).forEach(([memberId, build]) => {
      if (requestedIds && !requestedIds.has(memberId)) return;
      const member = partyRoot.children.find((child) => child.userData?.chroniclesCharacterId === memberId);
      if (!member || member.getObjectByName(`chronicles-${memberId}-premium-back-detail`)) return;
      const detail = build({ coarsePointer });
      member.add(detail);
      member.userData.chroniclesBackDetail = 'premium-rear-silhouette-v1';
      installed.push({ member, detail });
    });
  });

  return () => {
    cancelled = true;
    installed.forEach(({ member, detail }) => {
      disposeModel(detail);
      detail.removeFromParent();
      member.userData.chroniclesBackDetail = null;
    });
    installed.length = 0;
  };
}

function installCanonicalMatthias(fallbackRoot, { coarsePointer = false, reducedMotion = false } = {}) {
  let cancelled = false;
  let visual = null;
  let mixer = null;
  let cancelLoadout = null;
  const fallbackChildren = [...fallbackRoot.children];
  fallbackRoot.userData.chroniclesArtSource = 'procedural-fallback-loading';

  const loader = new GLTFLoader();
  loader.load(
    MATTHIAS_MODEL_URL,
    (gltf) => {
      if (cancelled) {
        disposeModel(gltf?.scene);
        return;
      }
      if (!gltf?.scene) {
        fallbackRoot.userData.chroniclesArtSource = 'procedural-fallback';
        return;
      }

      visual = gltf.scene;
      visual.name = 'chronicles-matthias-blender-canonical';
      visual.position.set(0, 0, 0);
      visual.rotation.set(0, 0, 0);
      // The Home canonical is ~2.35 world units tall. Tactics' procedural pawn
      // is ~1.65, so this preserves the battle silhouette and camera contract.
      visual.scale.setScalar(0.72);
      visual.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = !coarsePointer;
        node.receiveShadow = true;
        node.frustumCulled = true;
      });

      fallbackChildren.forEach((node) => { node.visible = false; });
      fallbackRoot.add(visual);
      cancelLoadout = installChroniclesDefaultLoadoutArt(fallbackRoot, 'matthias', { coarsePointer });
      fallbackRoot.userData.chroniclesArtSource = 'blender-home-canonical-v1';

      const idle = gltf.animations?.find((clip) => clip.name === 'Idle') || gltf.animations?.[0];
      if (!idle) return;
      mixer = new THREE.AnimationMixer(visual);
      const action = mixer.clipAction(idle);
      action.setLoop(THREE.LoopRepeat, Infinity).play();
      if (reducedMotion) mixer.setTime(Math.max(0, idle.duration * 0.34));
      fallbackRoot.userData.chroniclesArtTick = reducedMotion
        ? null
        : (time) => mixer?.setTime(Math.max(0, Number(time) || 0) % Math.max(0.01, idle.duration));
    },
    undefined,
    () => {
      if (!cancelled) fallbackRoot.userData.chroniclesArtSource = 'procedural-fallback';
    },
  );

  return () => {
    cancelled = true;
    mixer?.stopAllAction?.();
    cancelLoadout?.();
    cancelLoadout = null;
    fallbackRoot.userData.chroniclesArtTick = null;
    if (visual) {
      disposeModel(visual);
      visual.removeFromParent();
      visual = null;
    }
  };
}

export function installChroniclesCanonicalMatthias(
  fallbackRoot,
  { coarsePointer = false, reducedMotion = false } = {},
) {
  if (!fallbackRoot) return () => {};
  const cancelMatthias = installCanonicalMatthias(fallbackRoot, { coarsePointer, reducedMotion });
  fallbackRoot.userData.chroniclesArtCancel = cancelMatthias;
  return cancelMatthias;
}

export const CHRONICLES_TACTICS_BLENDER_ART_META = Object.freeze({
  matthias: 'models/matthias-home-canonical.glb',
  sourceOfTruth: 'scripts/blender/build_home_matthias.py',
  partySourceOfTruth: 'scripts/blender/build_chronicles_tactics_party.py',
  partyModel: 'models/chronicles-tactics-party.glb',
  partyAssetVersion: 'chronicles-tactics-party-v3',
  partyBackDetail: 'premium-rear-silhouette-v1',
  runtimeUpgrade: 'async-fallback-first-lazy-detail',
  fallback: 'chroniclesOfMatthiasArt.js',
});