import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

export function installChroniclesCanonicalMatthias(
  fallbackRoot,
  { coarsePointer = false, reducedMotion = false } = {},
) {
  if (!fallbackRoot) return () => {};

  let cancelled = false;
  let visual = null;
  let mixer = null;
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

  const cancel = () => {
    cancelled = true;
    mixer?.stopAllAction?.();
    fallbackRoot.userData.chroniclesArtTick = null;
    if (visual) {
      disposeModel(visual);
      visual.removeFromParent();
      visual = null;
    }
  };
  fallbackRoot.userData.chroniclesArtCancel = cancel;
  return cancel;
}

export const CHRONICLES_TACTICS_BLENDER_ART_META = Object.freeze({
  matthias: 'models/matthias-home-canonical.glb',
  sourceOfTruth: 'scripts/blender/build_home_matthias.py',
  runtimeUpgrade: 'async-fallback-first',
  fallback: 'chroniclesOfMatthiasArt.js',
});
