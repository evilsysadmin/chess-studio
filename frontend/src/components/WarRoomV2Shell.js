import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const WAR_ROOM_V2_STAGING_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v2/staging/current.glb';
export const WAR_ROOM_V2_BOARD_ANCHOR_Y = 1.12;

export function warRoomV2ModelUrl({
  buildSha = import.meta.env.VITE_BUILD_SHA,
  baseUrl = WAR_ROOM_V2_STAGING_MODEL_URL,
} = {}) {
  const version = String(buildSha || '').trim();
  if (!version) return baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}build=${encodeURIComponent(version)}`;
}

export function warRoomV2EnvMapIntensity(materialName = '') {
  const name = String(materialName || '').toLowerCase();
  if (name.includes('brass') || name.includes('armor')) return 0.88;
  if (name.includes('window')) return 0.62;
  if (name.includes('stone')) return 0.20;
  if (name.includes('leather') || name.includes('velvet') || name.includes('rug')) return 0.16;
  if (name.includes('walnut') || name.includes('wood') || name.includes('parquet')) return 0.32;
  return 0.28;
}

export function warRoomV2PracticalLightProfile({ coarsePointer = false } = {}) {
  return {
    fire: {
      color: 0xff8a38,
      intensity: coarsePointer ? 1.35 : 2.05,
      distance: 10.5,
      decay: 2,
    },
    moon: {
      color: 0x6f98ff,
      intensity: coarsePointer ? 1.65 : 2.75,
      distance: 13.5,
      decay: 2,
    },
  };
}

function installAuthoredPracticalLights(root, { coarsePointer = false } = {}) {
  const profile = warRoomV2PracticalLightProfile({ coarsePointer });
  const entries = [
    ['WR_ANCHOR_fireplace_practical', 'war-room-v2-fire-practical', profile.fire],
    ['WR_ANCHOR_window_moonlight', 'war-room-v2-moon-practical', profile.moon],
  ];

  let installed = 0;
  for (const [anchorName, lightName, spec] of entries) {
    const authoredAnchor = root.getObjectByName(anchorName);
    if (!authoredAnchor) continue;
    const practical = new THREE.PointLight(spec.color, spec.intensity, spec.distance, spec.decay);
    practical.name = lightName;
    practical.castShadow = false;
    practical.userData.warRoomV2Practical = anchorName;
    authoredAnchor.add(practical);
    installed += 1;
  }
  root.userData.warRoomV2PracticalLights = installed;
  return installed;
}

function tuneRuntimeMaterial(material) {
  if (!material?.isMeshStandardMaterial) return;
  material.envMapIntensity = warRoomV2EnvMapIntensity(material.name);
  material.userData ||= {};
  material.userData.warRoomV2Finish = 'nocturnal-walnut-v2';
  material.needsUpdate = true;
}

function disposeShell(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse?.((node) => {
    if (node.geometry) geometries.add(node.geometry);
    const rows = Array.isArray(node.material) ? node.material : [node.material];
    rows.forEach((material) => {
      if (!material) return;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    });
  });
  textures.forEach((texture) => texture.dispose?.());
  materials.forEach((material) => material.dispose?.());
  geometries.forEach((geometry) => geometry.dispose?.());
}

export async function installWarRoomV2Shell(
  scene,
  {
    whiteSide = true,
    coarsePointer = false,
    url = warRoomV2ModelUrl(),
  } = {},
) {
  if (!scene?.add) throw new Error('War Room v2 requires a Three.js scene');
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const root = gltf?.scene;
  if (!root) throw new Error('War Room v2 GLB has no scene');

  root.name = 'war-room-v2-blender-shell';
  // Blender exports Z-up to glTF Y-up. Its preview board top is Y=1.12 after
  // conversion, while the live Three board uses Y=0 as its tactical datum.
  root.position.set(0, -WAR_ROOM_V2_BOARD_ANCHOR_Y, 0);
  root.rotation.y = whiteSide ? 0 : Math.PI;
  const tunedMaterials = new Set();
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = !coarsePointer;
    node.receiveShadow = true;
    node.frustumCulled = true;
    const rows = Array.isArray(node.material) ? node.material : [node.material];
    rows.forEach((material) => {
      if (!material || tunedMaterials.has(material)) return;
      tunedMaterials.add(material);
      tuneRuntimeMaterial(material);
    });
  });
  const practicalLights = installAuthoredPracticalLights(root, { coarsePointer });
  root.userData.warRoomVariant = 'v2';
  root.userData.warRoomRuntimeFinish = 'gltf-pbr-nocturnal-v4-authored-practicals';
  root.userData.warRoomV2PracticalLights = practicalLights;
  scene.add(root);

  return () => {
    root.removeFromParent();
    disposeShell(root);
  };
}
