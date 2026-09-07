import * as THREE from 'three';
import { createWarRoomCampaignTexture } from './WarRoomCampaignArt.js';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';

const GALLERY = Object.freeze({
  darkWood: 0x25150f,
  warmWood: 0x53331f,
  agedGold: 0x8d672d,
  brass: 0xb8893d,
  iron: 0x1b1917,
  ironWarm: 0x332720,
  ember: 0xff4a13,
  flame: 0xff8f36,
  flameCore: 0xffd27a,
});

// Campaign art is tiny, immutable approved mock data. Keep one decoded/upload
// prototype per module lifetime and clone only the Texture wrapper for each
// scene. Re-entering War Room no longer base64-decodes and rebuilds the same
// RGBA buffers four times on every mount, while each scene still owns/disposes
// its own Texture object safely.
const campaignTexturePrototypes = new Map();
let torchHaloTexturePrototype = null;

function campaignTexture(key) {
  let prototype = campaignTexturePrototypes.get(key);
  if (!prototype) {
    prototype = createWarRoomCampaignTexture(key);
    prototype.userData.warRoomCampaignTextureCache = 'module-prototype-v1';
    campaignTexturePrototypes.set(key, prototype);
  }
  const texture = prototype.clone();
  texture.needsUpdate = true;
  texture.userData = {
    ...prototype.userData,
    warRoomCampaignTextureCache: 'module-clone-v1',
  };
  return texture;
}

function torchHaloTexture() {
  if (!torchHaloTexturePrototype) {
    const size = 32;
    const data = new Uint8Array(size * size * 4);
    const center = (size - 1) / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = (x - center) / center;
        const dy = (y - center) / center;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const falloff = THREE.MathUtils.clamp(1 - distance, 0, 1);
        const alpha = Math.round(255 * falloff * falloff);
        const index = (y * size + x) * 4;
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = alpha;
      }
    }
    torchHaloTexturePrototype = new THREE.DataTexture(
      data,
      size,
      size,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    torchHaloTexturePrototype.colorSpace = THREE.NoColorSpace;
    torchHaloTexturePrototype.needsUpdate = true;
    torchHaloTexturePrototype.userData.warRoomTorchHalo = 'radial-amber-v1';
  }
  const texture = torchHaloTexturePrototype.clone();
  texture.needsUpdate = true;
  texture.userData = { ...torchHaloTexturePrototype.userData };
  return texture;
}

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.04,
    roughness: options.roughness ?? 0.62,
    clearcoat: options.clearcoat ?? 0.16,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.36,
    specularIntensity: options.specularIntensity ?? 0.34,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    map: options.map ?? null,
  });
}

function addMesh(group, geometry, material, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function addBox(group, size, material, position, name = '') {
  return addMesh(group, new THREE.BoxGeometry(...size), material, position, [0, 0, 0], name);
}

function replaceCentralCanvas(frame, artKey, title) {
  const canvas = frame?.getObjectByName?.('war-room-premium-painting-canvas');
  if (!canvas?.material) return false;

  const previous = canvas.material.map;
  if (previous?.userData?.warRoomCampaignArt === artKey) return true;
  previous?.dispose?.();

  // Swap only the artwork. The premium finish pass already gave this canvas
  // woven linen, bump, varnish and museum-grade material response; replacing
  // those values here would make the new art look flatter than the old one.
  canvas.material.map = campaignTexture(artKey);
  canvas.material.color.setHex(0xffffff);
  canvas.material.needsUpdate = true;
  canvas.userData.warRoomCampaignArt = artKey;
  canvas.userData.warRoomCampaignTitle = title;

  frame.userData.warRoomGalleryRole = 'central-campaign-canvas';
  frame.userData.warRoomCampaignGalleryVersion = 'approved-mock-v1';
  frame.userData.warRoomCampaignArt = artKey;
  frame.userData.warRoomCampaignTitle = title;
  delete frame.userData.warRoomLandscapeVersion;
  delete frame.userData.warRoomLandscapeSubject;
  delete frame.userData.warRoomGalleryLandscapeVersion;
  return true;
}

function applyCentralCampaignArt(root) {
  let changed = 0;
  changed += replaceCentralCanvas(
    root?.getObjectByName?.('war-room-premium-painting-0'),
    'command',
    'Matthias al mando',
  ) ? 1 : 0;
  changed += replaceCentralCanvas(
    root?.getObjectByName?.('war-room-premium-painting-1'),
    'victory',
    'Matthias en la victoria',
  ) ? 1 : 0;
  return changed;
}

function registerCampaignArtFinalizer(group) {
  return registerWarRoomDeferredFinalizer(group, {
    key: 'military-gallery-art-v1',
    run: (root) => {
      const changed = applyCentralCampaignArt(root || group);
      const owner = (root || group)?.getObjectByName?.('war-room-castle-architecture') || group;
      if (owner?.userData) owner.userData.warRoomMilitaryGalleryFinalized = 'approved-mock-v1';
      return changed;
    },
  });
}

function addSidePainting(group, {
  side,
  wallZ,
  towardBoard,
  artKey,
  title,
  offset,
}) {
  const frame = new THREE.Group();
  frame.name = side < 0 ? 'war-room-campaign-painting-left' : 'war-room-campaign-painting-right';
  frame.userData.warRoomGalleryRole = 'side-campaign-canvas';
  frame.userData.warRoomCampaignGalleryVersion = 'approved-mock-v1';
  frame.userData.warRoomCampaignArt = artKey;
  frame.userData.warRoomCampaignTitle = title;

  const dark = physical(GALLERY.darkWood, {
    roughness: 0.48,
    clearcoat: 0.34,
    specularIntensity: 0.38,
  });
  const wood = physical(GALLERY.warmWood, {
    roughness: 0.44,
    clearcoat: 0.4,
    specularIntensity: 0.42,
  });
  const gold = physical(GALLERY.agedGold, {
    metalness: 0.68,
    roughness: 0.32,
    clearcoat: 0.24,
    specularIntensity: 0.54,
  });
  const canvasMat = physical(0xffffff, {
    roughness: 0.72,
    clearcoat: 0.08,
    clearcoatRoughness: 0.68,
    specularIntensity: 0.18,
    map: campaignTexture(artKey),
  });

  addBox(frame, [1.68, 2.2, 0.08], dark, [0, 0, 0], 'war-room-campaign-frame-back');
  addBox(frame, [1.56, 2.08, 0.04], wood, [0, 0, 0.048], 'war-room-campaign-frame-bed');
  addBox(frame, [1.36, 1.86, 0.028], canvasMat, [0, 0, 0.086], 'war-room-campaign-side-canvas');

  for (const [x, y, w, h] of [
    [0, 1.02, 1.6, 0.07], [0, -1.02, 1.6, 0.07],
    [-0.76, 0, 0.07, 2.08], [0.76, 0, 0.07, 2.08],
  ]) {
    const trim = addBox(frame, [w, h, 0.045], gold, [x, y, 0.105], 'war-room-campaign-frame-gilt');
    trim.castShadow = false;
  }

  frame.position.set(side * 7.66, 3.28, wallZ + towardBoard * offset);
  frame.rotation.y = -side * Math.PI / 2;
  frame.userData.warRoomOffsetFromWall = offset;
  frame.userData.facesWarTable = true;
  group.add(frame);
  return frame;
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function attachTorchKinetics(outer, inner, light, phase) {
  const outerBase = outer.scale.clone();
  const innerBase = inner.scale.clone();
  const baseIntensity = light.intensity;
  outer.userData.warRoomAnimatedTorch = true;
  light.userData.baseWarRoomIntensity = baseIntensity;

  outer.onBeforeRender = () => {
    const now = nowMs();
    const slow = Math.sin(now * 0.0061 + phase);
    const fast = Math.sin(now * 0.0197 + phase * 1.71);
    const lick = Math.sin(now * 0.031 + phase * 0.63);
    const flutter = slow * 0.07 + fast * 0.045 + lick * 0.025;

    outer.rotation.z = slow * 0.065 + fast * 0.02;
    inner.rotation.z = -slow * 0.04 + lick * 0.018;
    outer.scale.set(
      outerBase.x * (1 - fast * 0.055),
      outerBase.y * (1 + slow * 0.12 + lick * 0.04),
      outerBase.z * (1 - slow * 0.035),
    );
    inner.scale.set(
      innerBase.x * (1 + fast * 0.035),
      innerBase.y * (1 + lick * 0.1),
      innerBase.z,
    );
    light.intensity = baseIntensity * (1 + flutter);
  };
}

function flameGeometry(radius = 0.12, height = 0.58) {
  const profile = [
    [0.014, 0],
    [0.08, 0.06],
    [radius, 0.18],
    [radius * 0.9, 0.32],
    [radius * 0.62, 0.45],
    [radius * 0.3, 0.54],
    [0.008, height],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(profile, 14);
}

function addGothicFinial(group, material, y, flip = false) {
  const finial = addMesh(
    group,
    new THREE.ConeGeometry(0.115, 0.22, 4),
    material,
    [0, y, 0.018],
    [0, Math.PI / 4, flip ? Math.PI : 0],
    'war-room-side-torch-backplate-finial',
  );
  finial.castShadow = false;
  return finial;
}

function addBrazierCage(torch, iron, ironHighlight, emberMat) {
  const z = 0.47;

  addMesh(torch, new THREE.CylinderGeometry(0.12, 0.095, 0.17, 12), iron, [0, 0.1, z], [0, 0, 0], 'war-room-side-torch-neck');
  addMesh(torch, new THREE.CylinderGeometry(0.17, 0.105, 0.16, 14), ironHighlight, [0, 0.22, z], [0, 0, 0], 'war-room-side-torch-brazier-bowl');
  addMesh(torch, new THREE.TorusGeometry(0.185, 0.025, 8, 24), ironHighlight, [0, 0.31, z], [Math.PI / 2, 0, 0], 'war-room-side-torch-brazier-rim');

  const coal = addMesh(torch, new THREE.SphereGeometry(0.145, 12, 8), emberMat, [0, 0.31, z], [0, 0, 0], 'war-room-side-torch-embers');
  coal.scale.set(1, 0.28, 0.8);
  coal.castShadow = false;

  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    const x = Math.cos(angle) * 0.145;
    const cageZ = z + Math.sin(angle) * 0.145;
    const bar = addMesh(
      torch,
      new THREE.CylinderGeometry(0.014, 0.018, 0.28, 7),
      iron,
      [x, 0.43, cageZ],
      [0, 0, 0],
      'war-room-side-torch-cage-bar',
    );
    bar.rotation.z = -Math.cos(angle) * 0.12;
    bar.rotation.x = Math.sin(angle) * 0.12;
    bar.castShadow = false;

    const crown = addMesh(
      torch,
      new THREE.ConeGeometry(0.028, 0.11, 4),
      ironHighlight,
      [x * 1.04, 0.615, z + Math.sin(angle) * 0.151],
      [0, Math.PI / 4, 0],
      'war-room-side-torch-crown-spike',
    );
    crown.castShadow = false;
  }
}

function addSideTorch(group, { side, wallZ, towardBoard, offset, phase }) {
  const torch = new THREE.Group();
  torch.name = side < 0 ? 'war-room-side-torch-left' : 'war-room-side-torch-right';
  torch.userData.warRoomPracticalDecor = 'animated-castle-torch';
  torch.userData.warRoomTorchArt = 'approved-premium-mock-v2';
  torch.userData.warRoomTorchForm = 'gothic-wall-sconce-brazier';
  torch.userData.warRoomTorchFire = 'hearth-bright-v3';
  torch.userData.warRoomTorchLighting = 'gallery-spill-v2';
  torch.userData.warRoomWallGlowRealLight = 'omitted-halo-owned-v1';

  const iron = physical(GALLERY.iron, {
    metalness: 0.64,
    roughness: 0.48,
    clearcoat: 0.1,
    specularIntensity: 0.48,
  });
  const ironHighlight = physical(GALLERY.ironWarm, {
    metalness: 0.7,
    roughness: 0.39,
    clearcoat: 0.12,
    specularIntensity: 0.54,
  });
  const emberMat = physical(0x8a2a12, {
    roughness: 0.74,
    clearcoat: 0,
    emissive: GALLERY.ember,
    emissiveIntensity: 2.1,
  });
  const outerMat = physical(GALLERY.flame, {
    roughness: 0.14,
    clearcoat: 0,
    emissive: 0xff5a1a,
    emissiveIntensity: 4.7,
    opacity: 0.98,
    depthWrite: false,
  });
  const innerMat = physical(0xffe3a0, {
    roughness: 0.1,
    clearcoat: 0,
    emissive: 0xffc35c,
    emissiveIntensity: 6.3,
    opacity: 0.98,
    depthWrite: false,
  });
  outerMat.blending = THREE.AdditiveBlending;
  innerMat.blending = THREE.AdditiveBlending;

  // Approved mock: a long gothic wall plate with pointed finials, a short
  // horizontal forged arm and an open basket brazier. The old thin shaft/cup
  // silhouette read as a Roman pilum; this keeps the mass close to the wall.
  addBox(torch, [0.22, 0.94, 0.075], iron, [0, -0.14, 0], 'war-room-side-torch-backplate');
  addGothicFinial(torch, ironHighlight, 0.43, false);
  addGothicFinial(torch, ironHighlight, -0.71, true);

  for (const y of [0.19, -0.14, -0.47]) {
    const rivet = addMesh(torch, new THREE.SphereGeometry(0.034, 8, 6), ironHighlight, [0, y, 0.055], [0, 0, 0], 'war-room-side-torch-rivet');
    rivet.scale.z = 0.4;
    rivet.castShadow = false;
  }

  addBox(torch, [0.105, 0.105, 0.47], iron, [0, -0.03, 0.27], 'war-room-side-torch-wall-arm');
  addMesh(torch, new THREE.CylinderGeometry(0.09, 0.09, 0.12, 12), ironHighlight, [0, -0.03, 0.115], [Math.PI / 2, 0, 0], 'war-room-side-torch-arm-collar');
  addBrazierCage(torch, iron, ironHighlight, emberMat);

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xff8d3d,
    map: torchHaloTexture(),
    transparent: true,
    opacity: 0.44,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const halo = addMesh(
    torch,
    new THREE.PlaneGeometry(2.45, 2.75),
    haloMaterial,
    [0, 0.28, 0.012],
    [0, 0, 0],
    'war-room-side-torch-wall-halo',
  );
  halo.castShadow = false;
  halo.receiveShadow = false;
  halo.renderOrder = 1;

  const outer = addMesh(
    torch,
    flameGeometry(0.13, 0.62),
    outerMat,
    [0, 0.36, 0.47],
    [0, 0, 0],
    'war-room-side-torch-flame-outer',
  );
  outer.scale.set(1, 1.03, 0.82);
  const sideLick = addMesh(
    outer,
    flameGeometry(0.07, 0.38),
    outerMat,
    [0.07, 0.08, 0.015],
    [0, 0, -0.24],
    'war-room-side-torch-flame-side',
  );
  sideLick.scale.set(0.82, 0.88, 0.72);
  sideLick.castShadow = false;

  const inner = addMesh(
    torch,
    flameGeometry(0.07, 0.4),
    innerMat,
    [-0.012, 0.385, 0.485],
    [0, 0, 0.055],
    'war-room-side-torch-flame-inner',
  );
  inner.scale.set(0.9, 0.92, 0.76);
  outer.castShadow = false;
  inner.castShadow = false;

  // One real light drives PBR response on metal, frames and furniture. The
  // additive halo owns the broad wall wash, avoiding a second redundant point
  // light per torch with no visual loss after the desktop hard-cut.
  const light = new THREE.PointLight(0xff8738, 7.4, 9.2, 2);
  light.name = 'war-room-side-torch-light';
  light.position.set(0, 0.62, 0.7);
  light.castShadow = false;
  torch.add(light);
  attachTorchKinetics(outer, inner, light, phase);

  // Move the practical further toward the room entrance and slightly upward.
  // At gameplay framing this creates a clean strip of wall between painting and
  // sconce instead of reading like the torch belongs to the picture frame.
  torch.position.set(side * 7.61, 4.42, wallZ + towardBoard * offset);
  torch.rotation.y = -side * Math.PI / 2;
  torch.userData.warRoomOffsetFromWall = offset;
  group.add(torch);
  return torch;
}

export function installWarRoomMilitaryGallery(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard) || coarsePointer) return 0;
  if (group.userData.warRoomMilitaryGalleryVersion === 'approved-mock-v1') {
    registerCampaignArtFinalizer(group);
    return 0;
  }

  const centralReplaced = applyCentralCampaignArt(group);

  addSidePainting(group, {
    side: -1,
    wallZ,
    towardBoard,
    artKey: 'cavalry',
    title: 'Carga de caballería de Matthias',
    offset: 3.95,
  });
  addSidePainting(group, {
    side: 1,
    wallZ,
    towardBoard,
    artKey: 'laurel',
    title: 'Gloria perfectamente modesta de Matthias',
    offset: 3.95,
  });
  addSideTorch(group, { side: -1, wallZ, towardBoard, offset: 7.45, phase: 0.7 });
  addSideTorch(group, { side: 1, wallZ, towardBoard, offset: 7.45, phase: 3.1 });

  group.userData.warRoomMilitaryGalleryVersion = 'approved-mock-v1';
  group.userData.warRoomMilitaryGalleryCentralCanvases = centralReplaced;
  group.userData.warRoomMilitaryGallerySideCanvases = 2;
  group.userData.warRoomMilitaryGalleryTorches = 2;
  group.userData.warRoomRetiredTorchWallGlowLightsOmitted = 2;
  group.userData.warRoomCampaignTextureCache = 'module-prototype-v1';
  group.userData.warRoomTorchArt = 'approved-premium-mock-v2';
  group.userData.warRoomTorchSpacing = 'gallery-breathing-room-v4';
  group.userData.warRoomTorchFire = 'hearth-bright-v3';
  group.userData.warRoomTorchLighting = 'gallery-spill-v2';
  registerCampaignArtFinalizer(group);
  return centralReplaced + 4;
}
