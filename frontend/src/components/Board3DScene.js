import * as THREE from 'three';
import { getCameraFramingProfile } from './Board3DSurfaces.js';
import { warRoomDecorProfile } from './WarRoom3DMobileVisuals.js';

export function addMesh(group, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function makeTextSprite(text, color = '#e7dcc0') {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '700 34px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.34, 0.17, 1);
  sprite.userData.ownedTexture = texture;
  return sprite;
}

function addBox(group, size, color, position, options = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.68,
    clearcoat: options.clearcoat ?? 0.18,
    clearcoatRoughness: 0.25,
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
  });
  const mesh = addMesh(group, new THREE.BoxGeometry(...size), material, position, options.rotation || [0, 0, 0]);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function buildTrophy(group, x, y, z, goldMaterial) {
  addMesh(group, new THREE.CylinderGeometry(0.12, 0.17, 0.08, 24), goldMaterial, [x, y, z]);
  addMesh(group, new THREE.CylinderGeometry(0.05, 0.07, 0.22, 20), goldMaterial, [x, y + 0.14, z]);
  addMesh(group, new THREE.SphereGeometry(0.13, 20, 14), goldMaterial, [x, y + 0.3, z]);
  const handle = new THREE.TorusGeometry(0.15, 0.025, 8, 24, Math.PI * 1.35);
  addMesh(group, handle, goldMaterial, [x - 0.12, y + 0.3, z], [Math.PI / 2, 0, Math.PI * 0.2]);
  addMesh(group, handle.clone(), goldMaterial, [x + 0.12, y + 0.3, z], [Math.PI / 2, Math.PI, -Math.PI * 0.2]);
}

export function buildWarRoom(theme, whiteSide, coarsePointer = false) {
  const room = new THREE.Group();
  const far = whiteSide ? -1 : 1;
  const wallZ = far * 7.6;
  const towardBoard = -far;
  const wood = 0x2a160d;
  const woodDark = 0x130b07;
  const brass = 0xb88a35;
  const decor = warRoomDecorProfile(coarsePointer);

  addBox(room, [19, 0.38, 18], 0x100b08, [0, -0.55, 0], { roughness: 0.82, metalness: 0.02 });
  addBox(room, [15.6, 6.3, 0.35], woodDark, [0, 2.42, wallZ], { roughness: 0.82 });
  addBox(room, [15.3, 0.28, 0.55], wood, [0, 0.12, wallZ + towardBoard * 0.12]);
  addBox(room, [15.3, 0.25, 0.62], wood, [0, 2.0, wallZ + towardBoard * 0.12]);
  addBox(room, [15.3, 0.25, 0.62], wood, [0, 4.9, wallZ + towardBoard * 0.12]);

  for (const x of [-6.4, -4.7, -3, 3, 4.7, 6.4]) {
    addBox(room, [0.16, 4.7, 0.5], wood, [x, 2.55, wallZ + towardBoard * 0.16], { roughness: 0.75 });
  }

  const windowX = whiteSide ? 4.2 : -4.2;
  addBox(room, [4.3, 3.1, 0.16], 0x0a2334, [windowX, 3.3, wallZ + towardBoard * 0.27], { emissive: 0x0c3551, roughness: 0.42 });
  addBox(room, [4.55, 0.15, 0.35], wood, [windowX, 1.72, wallZ + towardBoard * 0.34]);
  addBox(room, [4.55, 0.15, 0.35], wood, [windowX, 4.88, wallZ + towardBoard * 0.34]);
  addBox(room, [0.15, 3.3, 0.35], wood, [windowX - 2.23, 3.3, wallZ + towardBoard * 0.34]);
  addBox(room, [0.15, 3.3, 0.35], wood, [windowX + 2.23, 3.3, wallZ + towardBoard * 0.34]);
  addBox(room, [0.11, 3.05, 0.28], 0x1f2f3a, [windowX, 3.3, wallZ + towardBoard * 0.38]);
  addBox(room, [4.3, 0.1, 0.28], 0x1f2f3a, [windowX, 3.3, wallZ + towardBoard * 0.38]);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xb9d9f0 }),
  );
  moon.position.set(windowX + 1.15, 4.05, wallZ + towardBoard * 0.43);
  room.add(moon);

  for (const [offset, height] of [[-1.1, 1.2], [-0.6, 1.65], [0, 1.4], [0.55, 2.0], [1.05, 1.45]]) {
    const tower = addBox(room, [0.4, height, 0.24], 0x09131b, [windowX + offset, 1.72 + height / 2, wallZ + towardBoard * 0.46], { roughness: 1, castShadow: false });
    tower.castShadow = false;
  }

  const bannerX = whiteSide ? -0.6 : 0.6;
  addBox(room, [2.25, 3.25, 0.12], decor.banner, [bannerX, 3.25, wallZ + towardBoard * 0.31], { roughness: 0.88 });
  addBox(room, [2.34, 0.09, 0.18], brass, [bannerX, 4.9, wallZ + towardBoard * 0.38], { metalness: 0.8, roughness: 0.24 });

  const gold = new THREE.MeshPhysicalMaterial({ color: brass, metalness: 0.82, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.1, envMapIntensity: 1.18 });
  const shelfZ = wallZ + towardBoard * 0.55;
  buildTrophy(room, bannerX - 2.35, 2.18, shelfZ, gold);
  buildTrophy(room, bannerX + 2.25, 2.18, shelfZ, gold);

  const globeX = whiteSide ? -4.2 : 4.2;
  addMesh(room, new THREE.SphereGeometry(0.52, 28, 18), new THREE.MeshPhysicalMaterial({ color: 0x283640, metalness: 0.25, roughness: 0.45, clearcoat: 0.45, envMapIntensity: 0.82 }), [globeX, 2.78, shelfZ]);
  addMesh(room, new THREE.TorusGeometry(0.61, 0.035, 10, 36), gold, [globeX, 2.78, shelfZ], [Math.PI / 2.2, 0, 0.35]);
  addMesh(room, new THREE.CylinderGeometry(0.05, 0.09, 0.55, 18), gold, [globeX, 2.25, shelfZ]);

  const candleMaterial = new THREE.MeshStandardMaterial({ color: 0xe7d1a4, roughness: 0.8 });
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffbd57 });
  for (const x of [bannerX - 3.15, bannerX + 3.15]) {
    addMesh(room, new THREE.CylinderGeometry(0.07, 0.09, 0.52, 18), candleMaterial, [x, 2.18, shelfZ]);
    addMesh(room, new THREE.SphereGeometry(0.055, 12, 8), flameMaterial, [x, 2.5, shelfZ]);
    const candleLight = new THREE.PointLight(0xffa94d, 3.2, 5, 2);
    candleLight.position.set(x, 2.55, shelfZ + towardBoard * 0.25);
    room.add(candleLight);
  }

  const ambientPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(17, 7),
    new THREE.MeshBasicMaterial({ color: theme.felt, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
  );
  ambientPanel.position.set(0, 2.4, wallZ + far * 0.25);
  if (whiteSide) ambientPanel.rotation.y = Math.PI;
  room.add(ambientPanel);

  return room;
}

export function fitBoardCamera(camera, width, height, whiteSide) {
  const aspect = Math.max(0.35, width / Math.max(1, height));
  const profile = getCameraFramingProfile(aspect);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance = THREE.MathUtils.clamp(
    (profile.halfSpan / Math.tan(limitingFov / 2)) * profile.padding,
    profile.minDistance,
    profile.maxDistance,
  );
  const target = new THREE.Vector3(0, profile.targetY, whiteSide ? -profile.targetZ : profile.targetZ);
  const direction = new THREE.Vector3(0, profile.cameraY, whiteSide ? profile.cameraZ : -profile.cameraZ).normalize();
  camera.aspect = aspect;
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.lookAt(target);
  camera.userData.basePosition = camera.position.clone();
  camera.userData.baseTarget = target.clone();
  camera.updateProjectionMatrix();
}
