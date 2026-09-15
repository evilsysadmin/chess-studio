import * as THREE from 'three';
import {
  CHRONICLES_ENEMIES,
  CHRONICLES_MAP,
  chroniclesEnemyIsActive,
  chroniclesEnemyPosition,
} from './chroniclesOfMatthias.js';
import { buildChroniclesCharacter, buildCorruptedPawn, buildGateJailer } from './chroniclesOfMatthiasArt.js';
import { buildScavengerKnight } from './chroniclesOfMatthiasScavengerKnight.js';
import { buildSpectralBishop } from './chroniclesOfMatthiasSpectralBishop.js';
import { createExperimentalThreeRenderer } from './experimentalThreeRenderer.js';

const CELL = 2.45;
const PARTY_OFFSETS = Object.freeze({
  rook: Object.freeze({ x: -0.56, z: 0.18, scale: 0.8 }),
  matthias: Object.freeze({ x: -0.18, z: 0.62, scale: 0.76 }),
  bishop: Object.freeze({ x: 0.34, z: -0.28, scale: 0.77 }),
  knight: Object.freeze({ x: 0.58, z: 0.35, scale: 0.78 }),
});

const TORCH_CELLS = Object.freeze([
  Object.freeze({ x: 1, y: 5, ox: -0.98, oz: -0.78 }),
  Object.freeze({ x: 5, y: 5, ox: 0.94, oz: -0.7 }),
  Object.freeze({ x: 1, y: 3, ox: -0.88, oz: -0.82 }),
  Object.freeze({ x: 5, y: 3, ox: 0.92, oz: -0.72 }),
  Object.freeze({ x: 2, y: 1, ox: -0.72, oz: -0.92 }),
  Object.freeze({ x: 5, y: 1, ox: 0.72, oz: -0.92 }),
]);

export function chroniclesIsoWorldForCell(x, y) {
  return new THREE.Vector3((x - 3) * CELL, 0, (y - 3) * CELL);
}

export function chroniclesIsometricCameraPose(focus = { x: 0, z: 0 }) {
  return {
    // Keep the party in the foreground and look through them into the room.
    // This is deliberately much lower/closer than the old dollhouse camera.
    position: new THREE.Vector3(focus.x + 5.3, 5.4, focus.z + 6.5),
    target: new THREE.Vector3(focus.x - 1.0, 0.88, focus.z - 1.35),
    fov: 40.5,
  };
}

export function chroniclesIsoInteractionForHit(interaction, hit) {
  if (!interaction?.mode || !hit) return null;
  if (interaction.mode === 'move' && hit.kind === 'cell') {
    const legal = (interaction.legalMoves || []).some((move) => move.x === hit.x && move.y === hit.y);
    return legal ? { kind: 'cell', x: hit.x, y: hit.y } : null;
  }
  if (interaction.mode === 'attack' && hit.kind === 'enemy') {
    const legal = (interaction.legalTargets || []).some((target) => target.enemyId === hit.enemyId);
    return legal ? { kind: 'enemy', enemyId: hit.enemyId } : null;
  }
  return null;
}

function isWalkable(x, y) {
  return CHRONICLES_MAP[y]?.[x] && CHRONICLES_MAP[y][x] !== '#';
}

function wallTouchesWalkable(x, y) {
  return isWalkable(x - 1, y) || isWalkable(x + 1, y) || isWalkable(x, y - 1) || isWalkable(x, y + 1);
}

function runtimeEnemyPosition(state, enemy) {
  const runtime = state?.enemyPositions?.[enemy.id];
  if (runtime && Number.isFinite(runtime.x) && Number.isFinite(runtime.y)) return runtime;
  return chroniclesEnemyPosition(state, enemy);
}

function ownedMaterial(params) {
  const material = new THREE.MeshStandardMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

function addMesh(root, geometry, material, position, name, { castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  root.add(mesh);
  return mesh;
}

function buildIsoDungeon({ coarsePointer }) {
  const root = new THREE.Group();
  root.name = 'chronicles-isometric-dungeon';
  const floorTargets = [];

  const floorLight = ownedMaterial({ color: 0x56564c, roughness: 0.88, metalness: 0.03 });
  const floorDark = ownedMaterial({ color: 0x2a2b28, roughness: 0.94, metalness: 0.02 });
  const wall = ownedMaterial({ color: 0x403a34, roughness: 0.97, metalness: 0.01 });
  const wallTrim = ownedMaterial({ color: 0x1d1a17, roughness: 0.98, metalness: 0 });
  const brass = ownedMaterial({ color: 0x6e4b26, roughness: 0.52, metalness: 0.62, emissive: 0x160a02, emissiveIntensity: 0.22 });

  const tileGeometry = new THREE.BoxGeometry(CELL * 0.96, 0.18, CELL * 0.96);
  const wallGeometry = new THREE.BoxGeometry(CELL, 2.65, CELL);

  CHRONICLES_MAP.forEach((row, y) => {
    [...row].forEach((tile, x) => {
      const world = chroniclesIsoWorldForCell(x, y);
      if (tile !== '#') {
        const tileMesh = new THREE.Mesh(tileGeometry, (x + y) % 2 ? floorDark : floorLight);
        tileMesh.position.set(world.x, -0.1, world.z);
        tileMesh.receiveShadow = true;
        tileMesh.name = `chronicles-iso-floor-${x}-${y}`;
        tileMesh.userData.chroniclesIsoCell = { x, y };
        root.add(tileMesh);
        floorTargets.push(tileMesh);
        return;
      }
      if (!wallTouchesWalkable(x, y)) return;
      // Leave the south/east shell open for the close behind-party camera,
      // otherwise the foreground wall would swallow the heroes and action.
      if (x === CHRONICLES_MAP[0].length - 1 || y === CHRONICLES_MAP.length - 1) return;
      const block = new THREE.Mesh(wallGeometry, wall);
      block.position.set(world.x, 1.23, world.z);
      block.castShadow = !coarsePointer;
      block.receiveShadow = true;
      block.name = `chronicles-iso-wall-${x}-${y}`;
      root.add(block);

      const trim = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.98, 0.08, CELL * 1.01), wallTrim);
      trim.position.set(world.x, 0.5 + ((x * 5 + y * 3) % 3) * 0.68, world.z);
      trim.receiveShadow = true;
      root.add(trim);
    });
  });

  const sigilWorld = chroniclesIsoWorldForCell(3, 4);
  const sigil = addMesh(
    root,
    new THREE.TorusGeometry(0.62, 0.085, 8, coarsePointer ? 18 : 30),
    brass,
    [sigilWorld.x, 0.035, sigilWorld.z],
    'chronicles-iso-sigil',
    { castShadow: false, receiveShadow: false },
  );
  sigil.rotation.x = -Math.PI / 2;

  // A few chunky architectural anchors create the framed, premium room seen
  // in the canonical reference without spending the mobile budget on clutter.
  const columnGeometry = new THREE.CylinderGeometry(0.22, 0.28, 2.8, coarsePointer ? 10 : 16);
  [[-5.9, -4.9], [5.9, -4.9], [-5.9, 5.9]].forEach(([x, z], index) => {
    addMesh(root, columnGeometry, wall, [x, 1.3, z], `chronicles-iso-column-${index}`);
  });

  return { root, sigilMaterial: brass, floorTargets };
}

function buildTorches(scene, { coarsePointer }) {
  const torches = [];
  const iron = ownedMaterial({ color: 0x2c2119, roughness: 0.62, metalness: 0.58 });
  const flameMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc16f,
    emissive: 0xff5b14,
    emissiveIntensity: 3.1,
    roughness: 0.38,
  });
  flameMaterial.userData.chroniclesIsoOwned = true;

  TORCH_CELLS.forEach(({ x, y, ox, oz }, index) => {
    const cell = chroniclesIsoWorldForCell(x, y);
    const root = new THREE.Group();
    root.name = `chronicles-iso-torch-${index}`;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.72, 8), iron);
    stem.position.y = 0.46;
    stem.castShadow = !coarsePointer;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.16, 8), iron);
    cup.position.y = 0.86;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), flameMaterial);
    flame.scale.set(0.88, 1.62, 0.88);
    flame.position.y = 1.06;
    const baseIntensity = coarsePointer ? 2.2 : 2.8;
    const light = new THREE.PointLight(0xff8538, baseIntensity, coarsePointer ? 6.8 : 8.4, 2);
    light.position.y = 1.02;
    root.add(stem, cup, flame, light);
    root.position.set(cell.x + ox, 0, cell.z + oz);
    scene.add(root);
    torches.push({ root, flame, light, baseIntensity, phase: index * 1.37 });
  });
  return torches;
}

function buildParty(scene, { coarsePointer }) {
  const root = new THREE.Group();
  root.name = 'chronicles-isometric-party';
  scene.add(root);

  const models = new Map();
  ['rook', 'matthias', 'bishop', 'knight'].forEach((id) => {
    const model = buildChroniclesCharacter(id, { coarsePointer });
    const config = PARTY_OFFSETS[id];
    model.position.set(config.x, 0, config.z);
    model.scale.setScalar(config.scale);
    model.rotation.y = Math.PI * 0.88;
    root.add(model);
    models.set(id, model);
  });

  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xf2bd67,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  });
  selectionMaterial.userData.chroniclesIsoOwned = true;
  const selection = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 8, coarsePointer ? 20 : 32), selectionMaterial);
  selection.rotation.x = -Math.PI / 2;
  selection.position.y = 0.025;
  root.add(selection);

  return { root, models, selection };
}

function buildEnemies(scene, { coarsePointer }) {
  const models = new Map([
    ['corrupted-pawn', buildCorruptedPawn({ coarsePointer })],
    ['gate-jailer', buildGateJailer({ coarsePointer })],
    ['spectral-bishop', buildSpectralBishop({ coarsePointer })],
    ['scavenger-knight', buildScavengerKnight({ coarsePointer })],
  ]);

  models.forEach((model, id) => {
    model.name = `chronicles-iso-enemy-${id}`;
    model.userData.chroniclesIsoEnemyId = id;
    model.scale.setScalar(id === 'gate-jailer' ? 0.92 : 0.8);
    model.rotation.y = -Math.PI * 0.18;
    model.visible = false;
    scene.add(model);
  });
  return models;
}

function buildInteractionMarkers(scene, { coarsePointer }) {
  const root = new THREE.Group();
  root.name = 'chronicles-isometric-interaction';
  scene.add(root);

  const segments = coarsePointer ? 24 : 36;
  const moveMaterial = new THREE.MeshBasicMaterial({
    color: 0xf0bd68,
    transparent: true,
    opacity: coarsePointer ? 0.72 : 0.62,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  const attackMaterial = new THREE.MeshBasicMaterial({
    color: 0xd96b3c,
    transparent: true,
    opacity: coarsePointer ? 0.82 : 0.72,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  moveMaterial.userData.chroniclesIsoOwned = true;
  attackMaterial.userData.chroniclesIsoOwned = true;
  const moveGeometry = new THREE.RingGeometry(0.5, 0.69, segments);
  const attackGeometry = new THREE.RingGeometry(0.63, 0.8, segments);

  const makePool = (count, geometry, material, prefix) => Array.from({ length: count }, (_, index) => {
    const marker = new THREE.Mesh(geometry, material);
    marker.name = `${prefix}-${index}`;
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.045;
    marker.renderOrder = 8;
    marker.visible = false;
    root.add(marker);
    return marker;
  });

  return {
    root,
    moveMarkers: makePool(4, moveGeometry, moveMaterial, 'chronicles-iso-move-marker'),
    attackMarkers: makePool(CHRONICLES_ENEMIES.length, attackGeometry, attackMaterial, 'chronicles-iso-attack-marker'),
  };
}

function nearestActiveEnemyWorld(state) {
  let best = null;
  CHRONICLES_ENEMIES.forEach((enemy) => {
    if (!chroniclesEnemyIsActive(state, enemy) || Number(state[enemy.hpKey] || 0) <= 0) return;
    const position = runtimeEnemyPosition(state, enemy);
    const separation = Math.abs(position.x - state.x) + Math.abs(position.y - state.y);
    if (!best || separation < best.separation) best = { position, separation };
  });
  return best ? chroniclesIsoWorldForCell(best.position.x, best.position.y) : null;
}

function descriptorForObject(object) {
  let current = object;
  while (current) {
    if (current.userData?.chroniclesIsoEnemyId) {
      return { kind: 'enemy', enemyId: current.userData.chroniclesIsoEnemyId };
    }
    if (current.userData?.chroniclesIsoCell) {
      const { x, y } = current.userData.chroniclesIsoCell;
      return { kind: 'cell', x, y };
    }
    current = current.parent;
  }
  return null;
}

function disposeScene(root) {
  root.traverse?.((node) => {
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) node.material.forEach((material) => material?.dispose?.());
    else if (node.material?.userData?.chroniclesIsoOwned) node.material.dispose?.();
  });
}

export function createChroniclesIsometricGame(host, { onReady, onCellClick, onEnemyClick } = {}) {
  if (!host) throw new Error('Chronicles isometric view requires a host element');

  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const renderer = createExperimentalThreeRenderer({ antialias: !coarse, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = coarse ? 1.18 : 1.14;
  renderer.setClearColor(0x100c09, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.7));
  renderer.shadowMap.enabled = !coarse;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x100c09);
  scene.fog = new THREE.FogExp2(0x17120e, coarse ? 0.028 : 0.024);

  const initialFocus = chroniclesIsoWorldForCell(2, 5);
  const initialPose = chroniclesIsometricCameraPose({ x: initialFocus.x, z: initialFocus.z });
  const camera = new THREE.PerspectiveCamera(initialPose.fov, 1, 0.1, 70);
  camera.position.copy(initialPose.position);
  camera.lookAt(initialPose.target);

  const hemi = new THREE.HemisphereLight(0xd6c5a8, 0x17110d, coarse ? 0.82 : 0.72);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffd39b, coarse ? 2.1 : 2.55);
  key.position.set(5.5, 10, 7.5);
  key.castShadow = !coarse;
  if (!coarse) {
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.bias = -0.001;
    key.shadow.normalBias = 0.04;
  }
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x758aa2, coarse ? 0.72 : 1.0);
  rim.position.set(-7, 5, -6);
  scene.add(rim);

  const dungeon = buildIsoDungeon({ coarsePointer: coarse });
  scene.add(dungeon.root);
  const torches = buildTorches(scene, { coarsePointer: coarse });
  const party = buildParty(scene, { coarsePointer: coarse });
  const enemies = buildEnemies(scene, { coarsePointer: coarse });
  const interactionMarkers = buildInteractionMarkers(scene, { coarsePointer: coarse });

  let latestState = null;
  let latestInteraction = null;
  let selectedMemberId = 'matthias';
  let destroyed = false;
  let visible = document.visibilityState !== 'hidden';
  let frame = 0;
  const clock = new THREE.Clock();
  const desiredParty = initialFocus.clone();
  const desiredFocus = initialFocus.clone();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  party.root.position.copy(initialFocus);

  function resize() {
    const width = Math.max(1, host.clientWidth || 1);
    const height = Math.max(1, host.clientHeight || 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function syncSelection() {
    const config = PARTY_OFFSETS[selectedMemberId] || PARTY_OFFSETS.matthias;
    party.selection.position.x = config.x;
    party.selection.position.z = config.z;
    party.selection.scale.setScalar((config.scale || 0.7) / 0.7);
  }

  function syncInteraction(nextInteraction = null) {
    latestInteraction = nextInteraction;
    interactionMarkers.moveMarkers.forEach((marker) => { marker.visible = false; });
    interactionMarkers.attackMarkers.forEach((marker) => { marker.visible = false; });

    if (nextInteraction?.mode === 'move') {
      (nextInteraction.legalMoves || []).slice(0, interactionMarkers.moveMarkers.length).forEach((move, index) => {
        const marker = interactionMarkers.moveMarkers[index];
        const world = chroniclesIsoWorldForCell(move.x, move.y);
        marker.position.set(world.x, 0.045, world.z);
        marker.visible = true;
      });
    } else if (nextInteraction?.mode === 'attack') {
      (nextInteraction.legalTargets || []).slice(0, interactionMarkers.attackMarkers.length).forEach((target, index) => {
        const marker = interactionMarkers.attackMarkers[index];
        const world = chroniclesIsoWorldForCell(target.x, target.y);
        marker.position.set(world.x, 0.055, world.z);
        marker.visible = true;
      });
    }
    renderer.domElement.style.cursor = nextInteraction?.mode ? 'crosshair' : 'default';
  }

  function syncState(state, nextSelectedMemberId = selectedMemberId, nextInteraction = latestInteraction) {
    latestState = state;
    selectedMemberId = nextSelectedMemberId || selectedMemberId;
    const partyCell = chroniclesIsoWorldForCell(state.x, state.y);
    desiredParty.copy(partyCell);

    const enemyFocus = nearestActiveEnemyWorld(state);
    desiredFocus.copy(partyCell);
    if (enemyFocus) desiredFocus.lerp(enemyFocus, 0.34);

    CHRONICLES_ENEMIES.forEach((definition) => {
      const model = enemies.get(definition.id);
      if (!model) return;
      const active = chroniclesEnemyIsActive(state, definition) && Number(state[definition.hpKey] || 0) > 0;
      model.visible = active;
      if (!active) return;
      const position = runtimeEnemyPosition(state, definition);
      const world = chroniclesIsoWorldForCell(position.x, position.y);
      model.userData.chroniclesIsoTarget = world;
      if (!model.userData.chroniclesIsoPlaced) {
        model.position.copy(world);
        model.userData.chroniclesIsoPlaced = true;
      }
    });

    state.party.forEach((member) => {
      const model = party.models.get(member.id);
      if (!model) return;
      model.visible = member.hp > 0;
      model.userData.chroniclesIsoHpRatio = Math.max(0, member.hp / member.maxHp);
    });

    dungeon.sigilMaterial.emissive.setHex(state.sigilAwake ? 0x8c3f0d : 0x160a02);
    dungeon.sigilMaterial.emissiveIntensity = state.sigilAwake ? 1.25 : 0.22;
    syncSelection();
    syncInteraction(nextInteraction);

    if (reducedMotion) {
      party.root.position.copy(desiredParty);
      enemies.forEach((model) => {
        if (model.visible && model.userData.chroniclesIsoTarget) model.position.copy(model.userData.chroniclesIsoTarget);
      });
      const pose = chroniclesIsometricCameraPose({ x: desiredFocus.x, z: desiredFocus.z });
      camera.position.copy(pose.position);
      camera.lookAt(pose.target);
      renderer.render(scene, camera);
    }
  }

  function pickInteraction(event) {
    if (!latestInteraction?.mode || !latestState) return null;
    const bounds = renderer.domElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const visibleEnemies = [...enemies.values()].filter((model) => model.visible);
    const intersections = raycaster.intersectObjects([...visibleEnemies, ...dungeon.floorTargets], true);
    for (const intersection of intersections) {
      const descriptor = descriptorForObject(intersection.object);
      const action = chroniclesIsoInteractionForHit(latestInteraction, descriptor);
      if (action) return action;
    }
    return null;
  }

  function onPointerUp(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const action = pickInteraction(event);
    if (!action) return;
    if (action.kind === 'cell') onCellClick?.({ x: action.x, y: action.y });
    else if (action.kind === 'enemy') onEnemyClick?.(action.enemyId);
  }

  function render() {
    if (destroyed) return;
    frame = requestAnimationFrame(render);
    if (!visible) return;
    const time = clock.getElapsedTime();

    if (!reducedMotion) {
      party.root.position.lerp(desiredParty, 0.14);
      enemies.forEach((model, id) => {
        if (!model.visible || !model.userData.chroniclesIsoTarget) return;
        model.position.lerp(model.userData.chroniclesIsoTarget, id === 'scavenger-knight' ? 0.18 : 0.13);
        model.position.y = Math.sin(time * 1.7 + id.length) * 0.012;
      });

      party.models.forEach((model, id) => {
        if (!model.visible) return;
        model.rotation.y = Math.PI * 0.88 + Math.sin(time * 0.55 + id.length) * 0.035;
        const hpRatio = model.userData.chroniclesIsoHpRatio ?? 1;
        model.position.y = Math.sin(time * 0.8 + id.length) * 0.006 - (1 - hpRatio) * 0.025;
      });

      torches.forEach((torch) => {
        const pulse = 0.94 + Math.sin(time * 7.2 + torch.phase) * 0.07 + Math.sin(time * 15.8 + torch.phase) * 0.025;
        torch.light.intensity = torch.baseIntensity * pulse;
        torch.flame.scale.set(0.86 + pulse * 0.03, 1.48 + pulse * 0.15, 0.86 + pulse * 0.03);
        torch.flame.rotation.z = Math.sin(time * 4.8 + torch.phase) * 0.08;
      });

      const pose = chroniclesIsometricCameraPose({ x: desiredFocus.x, z: desiredFocus.z });
      camera.position.lerp(pose.position, 0.08);
      const lookTarget = pose.target;
      const direction = lookTarget.clone().sub(camera.position).normalize();
      const currentTarget = camera.position.clone().add(direction.multiplyScalar(10));
      camera.lookAt(currentTarget.lerp(lookTarget, 0.18));
    }

    renderer.render(scene, camera);
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  const onWindowResize = () => resize();
  if (!observer) window.addEventListener('resize', onWindowResize);
  const onVisibility = () => { visible = document.visibilityState !== 'hidden'; };
  document.addEventListener('visibilitychange', onVisibility);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  resize();
  syncSelection();
  syncInteraction();
  render();
  onReady?.('THREE.JS · ISOMETRIC');

  return {
    renderState: syncState,
    renderMember(memberId) {
      selectedMemberId = memberId || 'matthias';
      syncSelection();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };
}
