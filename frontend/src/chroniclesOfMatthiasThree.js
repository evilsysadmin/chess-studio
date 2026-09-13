import * as THREE from 'three';
import { CHRONICLES_DIRECTIONS, CHRONICLES_MAP } from './chroniclesOfMatthias.js';
import { buildChroniclesCharacter, buildCorruptedPawn } from './chroniclesOfMatthiasArt.js';
import { buildChroniclesDungeonDressing } from './chroniclesOfMatthiasDungeonArt.js';
import { createExperimentalThreeRenderer } from './experimentalThreeRenderer.js';

const CELL = 4;
const CAMERA_Y = 1.62;

function worldForCell(x, y) {
  return new THREE.Vector3((x - 3) * CELL, CAMERA_Y, (y - 3) * CELL);
}

function createDungeonScene(scene, { coarsePointer = false } = {}) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x3d3a35, roughness: 0.96, metalness: 0.02 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 1, metalness: 0 });
  const mortar = new THREE.MeshStandardMaterial({ color: 0x272522, roughness: 1, metalness: 0 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x27241f, roughness: 0.92, metalness: 0.03 });

  const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(CELL * 7, 0.28, CELL * 7), floor);
  floorMesh.position.y = -0.18;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(CELL * 7, 0.24, CELL * 7), darkStone);
  ceiling.position.y = 3.55;
  scene.add(ceiling);

  const wallGeometry = new THREE.BoxGeometry(CELL, 3.6, CELL);
  CHRONICLES_MAP.forEach((row, y) => {
    [...row].forEach((tile, x) => {
      if (tile !== '#') return;
      const wall = new THREE.Mesh(wallGeometry, stone);
      const p = worldForCell(x, y);
      wall.position.set(p.x, 1.72, p.z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);

      if ((x + y) % 2 === 0) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.94, 0.07, CELL * 1.01), mortar);
        band.position.set(p.x, 1.05 + ((x * 3 + y) % 3) * 0.72, p.z);
        band.receiveShadow = true;
        scene.add(band);
      }
    });
  });

  const sigilMaterial = new THREE.MeshStandardMaterial({ color: 0x715321, roughness: 0.45, metalness: 0.55, emissive: 0x241300, emissiveIntensity: 0.3 });
  const sigil = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 8, 28), sigilMaterial);
  const sigilCell = worldForCell(3, 4);
  sigil.position.set(sigilCell.x, 0.035, sigilCell.z);
  sigil.rotation.x = -Math.PI / 2;
  sigil.receiveShadow = true;
  scene.add(sigil);

  const enemy = buildCorruptedPawn({ coarsePointer });
  const enemyCell = worldForCell(3, 5);
  enemy.position.set(enemyCell.x, 0, enemyCell.z);
  enemy.scale.setScalar(1.08);
  enemy.rotation.y = Math.PI;
  scene.add(enemy);

  const gateMaterial = new THREE.MeshStandardMaterial({ color: 0x171513, roughness: 0.66, metalness: 0.72, emissive: 0x120700, emissiveIntensity: 0.15 });
  const gate = new THREE.Group();
  const gateCell = worldForCell(3, 1);
  const gatePanel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.05, 0.28), gateMaterial);
  gatePanel.position.y = 1.48;
  gatePanel.castShadow = true;
  gatePanel.receiveShadow = true;
  const gateRune = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.09, 8, 24), sigilMaterial.clone());
  gateRune.position.set(0, 1.55, -0.17);
  gate.add(gatePanel, gateRune);
  gate.position.set(gateCell.x, 0, gateCell.z - 1.45);
  scene.add(gate);

  const torchMaterial = new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.7, metalness: 0.45 });
  const flameMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa44, roughness: 0.5, emissive: 0xff5b16, emissiveIntensity: 2.4 });
  const torches = [];
  [[1, 5], [5, 5], [1, 3], [5, 3], [2, 1], [5, 1]].forEach(([x, y], index) => {
    const p = worldForCell(x, y);
    const root = new THREE.Group();
    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.7, 8), torchMaterial);
    bracket.rotation.z = Math.PI / 2;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), flameMaterial);
    flame.scale.y = 1.8;
    flame.position.set(0.38, 0.18, 0);
    const light = new THREE.PointLight(0xff7a32, 1.8, 10, 2);
    light.position.set(0.38, 0.18, 0);
    root.add(bracket, flame, light);
    root.position.set(p.x, 2.1, p.z);
    root.rotation.y = (index % 2) * Math.PI;
    scene.add(root);
    torches.push({ root, flame, light, phase: index * 1.7 });
  });

  return { enemy, sigilMaterial, gateMaterial, gateRune, torches };
}

function disposeObject(root) {
  root?.traverse?.((node) => {
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) node.material.forEach((entry) => entry?.dispose?.());
    else node.material?.dispose?.();
  });
}

function disposeScene(scene) {
  disposeObject(scene);
}

function configureRenderer(renderer, { coarsePointer, alpha = false }) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x080706, alpha ? 0 : 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.2 : 1.65));
  renderer.shadowMap.enabled = !coarsePointer;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

export function createChroniclesOfMatthiasGame(host, { onReady } = {}) {
  if (!host) throw new Error('Chronicles of Matthias requires a host element');

  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const renderer = createExperimentalThreeRenderer({ antialias: !coarse, alpha: false, powerPreference: 'high-performance' });
  configureRenderer(renderer, { coarsePointer: coarse });
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x090807, 0.045);
  scene.add(new THREE.HemisphereLight(0x6b7480, 0x1b130d, 0.42));
  const camera = new THREE.PerspectiveCamera(67, 1, 0.08, 70);
  camera.rotation.order = 'YXZ';

  const dungeon = createDungeonScene(scene, { coarsePointer: coarse });
  const dressing = buildChroniclesDungeonDressing({ coarsePointer: coarse });
  scene.add(dressing);
  let destroyed = false;
  let visible = document.visibilityState !== 'hidden';
  let desiredPosition = worldForCell(1, 5);
  let desiredYaw = -Math.PI / 2;
  let latestState = null;
  let frame = 0;
  const clock = new THREE.Clock();

  camera.position.copy(desiredPosition);
  camera.rotation.set(0, desiredYaw, 0);

  function resize() {
    const width = Math.max(1, host.clientWidth || 1);
    const height = Math.max(1, host.clientHeight || 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function syncState(state) {
    latestState = state;
    desiredPosition = worldForCell(state.x, state.y);
    const direction = CHRONICLES_DIRECTIONS[state.direction];
    desiredYaw = Math.atan2(-direction.dx, -direction.dy);
    dungeon.enemy.visible = state.enemyHp > 0;
    const enemyGlow = dungeon.enemy.userData.chroniclesGlowMaterials || [];
    enemyGlow.forEach((glow) => {
      glow.emissiveIntensity = state.enemyHp === 1 ? 2.8 : 1.7;
    });
    dungeon.sigilMaterial.emissive.setHex(state.sigilAwake ? 0x7e3c0a : 0x241300);
    dungeon.sigilMaterial.emissiveIntensity = state.sigilAwake ? 1.8 : 0.3;
    dungeon.gateMaterial.emissive.setHex(state.sigilAwake ? 0x4e2705 : 0x120700);
    dungeon.gateMaterial.emissiveIntensity = state.sigilAwake ? 0.9 : 0.15;
    dungeon.gateRune.material.emissive.setHex(state.sigilAwake ? 0xcc6a16 : 0x241300);
    dungeon.gateRune.material.emissiveIntensity = state.sigilAwake ? 2.2 : 0.25;
    (dressing.userData.chroniclesRuneMaterials || []).forEach((runeMaterial) => {
      runeMaterial.emissive.setHex(state.sigilAwake ? 0x9d410b : 0x4b1d05);
      runeMaterial.emissiveIntensity = state.sigilAwake ? 1.35 : 0.55;
    });
    if (reducedMotion) {
      camera.position.copy(desiredPosition);
      camera.rotation.y = desiredYaw;
      renderer.render(scene, camera);
    }
  }

  function wrapAngle(value) {
    let angle = value;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function render() {
    if (destroyed) return;
    frame = requestAnimationFrame(render);
    if (!visible) return;
    const time = clock.getElapsedTime();
    if (!reducedMotion) {
      camera.position.lerp(desiredPosition, 0.16);
      camera.rotation.y += wrapAngle(desiredYaw - camera.rotation.y) * 0.18;
      dungeon.torches.forEach((torch) => {
        const pulse = 0.9 + Math.sin(time * 8.5 + torch.phase) * 0.08 + Math.sin(time * 17 + torch.phase) * 0.04;
        torch.light.intensity = 1.75 * pulse;
        torch.flame.scale.y = 1.65 + pulse * 0.18;
      });
      if (latestState?.enemyHp > 0) {
        dungeon.enemy.rotation.y = Math.PI + Math.sin(time * 0.9) * 0.12;
        dungeon.enemy.position.y = Math.sin(time * 1.7) * 0.018;
      }
    }
    renderer.render(scene, camera);
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  const onWindowResize = () => resize();
  if (!observer) window.addEventListener('resize', onWindowResize);
  const onVisibility = () => { visible = document.visibilityState !== 'hidden'; };
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  render();
  onReady?.('THREE.JS · FIRST PERSON');

  return {
    renderState: syncState,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('visibilitychange', onVisibility);
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };
}

export function createChroniclesPartyPortrait(host) {
  if (!host) throw new Error('Chronicles party portrait requires a host element');

  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const renderer = createExperimentalThreeRenderer({ antialias: !coarse, alpha: true, powerPreference: 'low-power' });
  configureRenderer(renderer, { coarsePointer: coarse, alpha: true });
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
  camera.position.set(2.55, 1.65, 4.25);
  camera.lookAt(0, 0.92, 0);
  scene.add(new THREE.HemisphereLight(0xe8d7bb, 0x17110d, 1.45));
  const key = new THREE.DirectionalLight(0xffd79a, 2.1);
  key.position.set(2.5, 4.2, 3.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8295b8, 1.15);
  rim.position.set(-3, 2.3, -2.2);
  scene.add(rim);

  const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 0.84, metalness: 0.08 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.12, coarse ? 18 : 28), pedestalMat);
  pedestal.position.y = -0.07;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const members = ['matthias', 'rook', 'bishop', 'knight'].map((id) => {
    const model = buildChroniclesCharacter(id, { coarsePointer: coarse });
    model.visible = id === 'matthias';
    model.rotation.y = -0.28;
    scene.add(model);
    return [id, model];
  });
  const models = new Map(members);
  let active = models.get('matthias');
  let destroyed = false;
  let frame = 0;
  let visible = document.visibilityState !== 'hidden';
  const clock = new THREE.Clock();

  function resize() {
    const width = Math.max(1, host.clientWidth || 1);
    const height = Math.max(1, host.clientHeight || 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function renderMember(memberId) {
    const next = models.get(memberId) || models.get('matthias');
    models.forEach((model) => { model.visible = model === next; });
    active = next;
    if (active) active.rotation.y = -0.28;
    renderer.render(scene, camera);
  }

  function render() {
    if (destroyed) return;
    frame = requestAnimationFrame(render);
    if (!visible) return;
    if (!reducedMotion && active) {
      const time = clock.getElapsedTime();
      active.rotation.y = -0.28 + Math.sin(time * 0.55) * 0.16;
      active.position.y = Math.sin(time * 0.9) * 0.008;
    }
    renderer.render(scene, camera);
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  const onWindowResize = () => resize();
  if (!observer) window.addEventListener('resize', onWindowResize);
  const onVisibility = () => { visible = document.visibilityState !== 'hidden'; };
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  render();

  return {
    renderMember,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('visibilitychange', onVisibility);
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };
}
