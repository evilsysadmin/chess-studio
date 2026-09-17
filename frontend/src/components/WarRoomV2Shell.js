import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const WAR_ROOM_V2_STAGING_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v2/staging/current.glb';
export const WAR_ROOM_V2_BOARD_ANCHOR_Y = 1.12;

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
    url = WAR_ROOM_V2_STAGING_MODEL_URL,
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
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = !coarsePointer;
    node.receiveShadow = true;
    node.frustumCulled = true;
  });
  root.userData.warRoomVariant = 'v2';
  scene.add(root);

  return () => {
    root.removeFromParent();
    disposeShell(root);
  };
}
