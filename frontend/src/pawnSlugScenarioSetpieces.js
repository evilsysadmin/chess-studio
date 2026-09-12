import * as THREE from 'three';

const SETPIECE_RANGE = 4.6;
const SETPIECE_DURATION = 2.4;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function basicMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

function mesh(geometry, material, { x = 0, y = 0, z = 0, rz = 0 } = {}) {
  const node = new THREE.Mesh(geometry, material);
  node.position.set(x, y, z);
  node.rotation.z = rz;
  node.castShadow = false;
  node.receiveShadow = false;
  return node;
}

function createForestLeaves() {
  const group = new THREE.Group();
  group.name = 'pawn-slug-setpiece-forest-leaves';
  const mat = basicMaterial(0x66744f, 0.86);
  for (let i = 0; i < 8; i += 1) {
    group.add(mesh(new THREE.PlaneGeometry(0.16, 0.08), mat, {
      x: (i - 3.5) * 0.17,
      y: 1.2 + (i % 3) * 0.12,
      z: 0.7 + (i % 2) * 0.05,
      rz: i * 0.63,
    }));
  }
  group.visible = false;
  return group;
}

function createDungeonRats() {
  const group = new THREE.Group();
  group.name = 'pawn-slug-setpiece-dungeon-rats';
  const mat = basicMaterial(0x302925, 0.95);
  for (let i = 0; i < 3; i += 1) {
    const rat = new THREE.Group();
    rat.position.set(i * 0.34 - 0.35, 0.13, 0.88 + i * 0.02);
    rat.add(
      mesh(new THREE.SphereGeometry(0.1, 7, 5), mat),
      mesh(new THREE.ConeGeometry(0.035, 0.16, 5), mat, { x: -0.13, rz: Math.PI / 2 }),
    );
    group.add(rat);
  }
  group.visible = false;
  return group;
}

function createRuinsDebris() {
  const group = new THREE.Group();
  group.name = 'pawn-slug-setpiece-ruins-debris';
  const mat = basicMaterial(0x81735e, 0.72);
  for (let i = 0; i < 7; i += 1) {
    group.add(mesh(new THREE.BoxGeometry(0.08 + (i % 3) * 0.025, 0.07, 0.06), mat, {
      x: (i - 3) * 0.13,
      y: 0.18 + (i % 2) * 0.04,
      z: 0.75,
      rz: i * 0.41,
    }));
  }
  group.visible = false;
  return group;
}

function createRuinsConvoy() {
  const group = new THREE.Group();
  group.name = 'pawn-slug-setpiece-ruins-convoy';
  group.position.z = -1.45;
  const steel = basicMaterial(0x30383d, 0.88);
  const canopy = basicMaterial(0x4a4d43, 0.84);
  const lamp = basicMaterial(0xe2a85a, 0.72);
  for (let i = 0; i < 3; i += 1) {
    const vehicle = new THREE.Group();
    vehicle.userData.distantConvoyVehicle = true;
    vehicle.position.set(-1.65 - i * 1.15, 0.46 + i * 0.035, -0.2 - i * 0.08);
    vehicle.scale.setScalar(0.72 - i * 0.06);
    vehicle.add(
      mesh(new THREE.BoxGeometry(0.82, 0.34, 0.28), steel),
      mesh(new THREE.BoxGeometry(0.42, 0.23, 0.3), canopy, { x: -0.12, y: 0.26 }),
      mesh(new THREE.CircleGeometry(0.07, 8), lamp, { x: 0.43, y: 0.03, z: 0.15 }),
      mesh(new THREE.CircleGeometry(0.13, 8), basicMaterial(0x171b1d, 0.95), { x: -0.25, y: -0.2, z: 0.15 }),
      mesh(new THREE.CircleGeometry(0.13, 8), basicMaterial(0x171b1d, 0.95), { x: 0.27, y: -0.2, z: 0.15 }),
    );
    group.add(vehicle);
  }
  group.visible = false;
  return group;
}

function createFortressAlarm() {
  const group = new THREE.Group();
  group.name = 'pawn-slug-setpiece-fortress-alarm';
  const ember = basicMaterial(0xffa13d, 0.9);
  const alarm = basicMaterial(0xff3f2f, 0.82);
  const ring = mesh(new THREE.RingGeometry(0.13, 0.19, 14), alarm, { x: 0.15, y: 2.15, z: 0.92 });
  ring.userData.fortressBeacon = true;
  group.add(ring);
  for (let i = 0; i < 7; i += 1) {
    const spark = mesh(new THREE.PlaneGeometry(0.08, 0.025), ember, {
      x: -0.55 + i * 0.18,
      y: 1.15 + (i % 3) * 0.18,
      z: 0.9 + (i % 2) * 0.03,
      rz: i * 0.37,
    });
    spark.userData.fortressSpark = true;
    group.add(spark);
  }
  group.visible = false;
  return group;
}

function captureMaterialOpacity(group) {
  const seen = new Set();
  const materials = [];
  group.traverse((node) => {
    const nodeMaterials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of nodeMaterials) {
      if (seen.has(material) || !Number.isFinite(material?.opacity)) continue;
      seen.add(material);
      materials.push({ material, opacity: material.opacity });
    }
  });
  return materials;
}

function capture(group, kind) {
  const children = [...group.children];
  return {
    group,
    kind,
    triggered: false,
    startedAt: null,
    materials: captureMaterialOpacity(group),
    base: children.map((child) => ({
      child,
      x: child.position.x,
      y: child.position.y,
      rz: child.rotation.z,
    })),
  };
}

function animateEntry(entry, elapsed) {
  const progress = Math.min(1, Math.max(0, elapsed / SETPIECE_DURATION));
  const fade = 1 - progress;
  entry.group.visible = progress < 1;
  entry.base.forEach((item, index) => {
    const phase = index * 0.73;
    if (entry.kind === 'forest') {
      item.child.position.x = item.x + progress * (0.7 + index * 0.06);
      item.child.position.y = item.y + Math.sin(progress * Math.PI + phase) * 0.75 + progress * 0.25;
      item.child.rotation.z = item.rz + progress * (2.2 + index * 0.12);
    } else if (entry.kind === 'dungeon') {
      item.child.position.x = item.x + progress * (2.8 + index * 0.4);
      item.child.position.y = item.y + Math.abs(Math.sin(progress * Math.PI * 4 + phase)) * 0.08;
    } else if (entry.kind === 'convoy') {
      item.child.position.x = item.x + progress * (5.2 + index * 0.5);
      item.child.position.y = item.y + Math.abs(Math.sin(progress * Math.PI * 8 + phase)) * 0.035;
    } else if (entry.kind === 'fortress') {
      if (item.child.userData.fortressBeacon) {
        const pulse = 0.88 + Math.max(0, Math.sin(elapsed * 12)) * 0.28;
        item.child.scale.setScalar(pulse);
        item.child.rotation.z = item.rz + Math.sin(elapsed * 5.5) * 0.08;
      } else {
        item.child.position.x = item.x + progress * (0.6 + index * 0.08);
        item.child.position.y = item.y + Math.sin(progress * Math.PI + phase) * (0.5 + index * 0.025) + progress * 0.18;
        item.child.rotation.z = item.rz + progress * (1.9 + index * 0.14);
      }
    } else {
      item.child.position.x = item.x + (index - 3) * progress * 0.12;
      item.child.position.y = item.y + Math.sin(progress * Math.PI) * (0.42 + index * 0.035);
      item.child.rotation.z = item.rz + progress * (1.4 + index * 0.18);
    }
  });
  for (const item of entry.materials) item.material.opacity = Math.max(0, item.opacity * fade);
}

function installIntoScenario(root, scenarioName, createGroup, kind, localX) {
  const scenario = root.getObjectByName(scenarioName);
  if (!scenario) return null;
  const group = createGroup();
  group.position.x = localX;
  scenario.add(group);
  return capture(group, kind);
}

export function createPawnSlugReactiveSetpieces(root, { reducedMotion = false } = {}) {
  if (!root) throw new Error('Pawn Slug reactive setpieces require a root');
  const entries = [
    installIntoScenario(root, 'pawn-slug-landmark-fallen-forest', createForestLeaves, 'forest', 8.2),
    installIntoScenario(root, 'pawn-slug-landmark-gambit-ruins', createRuinsDebris, 'ruins', 5.8),
    installIntoScenario(root, 'pawn-slug-landmark-gambit-ruins', createRuinsConvoy, 'convoy', 8.2),
    installIntoScenario(root, 'pawn-slug-landmark-dungeon-gate', createDungeonRats, 'dungeon', 4.2),
    installIntoScenario(root, 'pawn-slug-landmark-boss-fortress', createFortressAlarm, 'fortress', -5.2),
  ].filter(Boolean);
  const enabled = !reducedMotion && entries.length > 0;
  const world = new THREE.Vector3();

  return Object.freeze({
    enabled,
    count: entries.length,
    update(cameraX = 0, time = 0) {
      if (!enabled) return;
      const x = Number(cameraX) || 0;
      const t = Number(time) || 0;
      for (const entry of entries) {
        entry.group.getWorldPosition(world);
        if (!entry.triggered && Math.abs(world.x - x) <= SETPIECE_RANGE) {
          entry.triggered = true;
          entry.startedAt = t;
          entry.group.visible = true;
        }
        if (entry.triggered && entry.startedAt != null) animateEntry(entry, t - entry.startedAt);
      }
    },
    reset() {
      for (const entry of entries) {
        entry.triggered = false;
        entry.startedAt = null;
        entry.group.visible = false;
        entry.base.forEach((item) => {
          item.child.position.x = item.x;
          item.child.position.y = item.y;
          item.child.rotation.z = item.rz;
          item.child.scale.setScalar(1);
        });
        for (const item of entry.materials) item.material.opacity = item.opacity;
      }
    },
  });
}

export function attachPawnSlugReactiveSetpieces(root, { reducedMotion = prefersReducedMotion() } = {}) {
  const controller = createPawnSlugReactiveSetpieces(root, { reducedMotion });
  root.userData.pawnSlugReactiveSetpieces = controller;
  if (!controller.enabled) return controller;

  let lastFrame = -1;
  root.traverse((node) => {
    if (!node.name?.startsWith('pawn-slug-setpiece-')) return;
    const proxy = node.children.find((child) => child.isMesh) || node.children[0];
    if (!proxy) return;
    const previous = proxy.onBeforeRender;
    proxy.onBeforeRender = function setpieceBeforeRender(renderer, scene, camera, ...args) {
      previous?.call(this, renderer, scene, camera, ...args);
      const frame = Number(renderer?.info?.render?.frame);
      if (Number.isFinite(frame) && frame === lastFrame) return;
      if (Number.isFinite(frame)) lastFrame = frame;
      const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
      controller.update(camera?.position?.x || 0, now);
    };
  });
  return controller;
}
