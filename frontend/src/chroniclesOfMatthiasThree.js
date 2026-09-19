import * as THREE from 'three';
import {
  CHRONICLES_DIRECTIONS,
  CHRONICLES_ENEMIES,
  CHRONICLES_MAP,
  chroniclesEnemyIsActive,
  chroniclesEnemyPosition,
} from './chroniclesOfMatthias.js';
import { buildChroniclesCharacter, buildCorruptedPawn, buildGateJailer } from './chroniclesOfMatthiasArt.js';
import { buildChroniclesDungeonDressing } from './chroniclesOfMatthiasDungeonArt.js';
import { buildChroniclesDungeonAtmosphere } from './chroniclesOfMatthiasAtmosphere.js';
import { buildScavengerKnight } from './chroniclesOfMatthiasScavengerKnight.js';
import { buildSpectralBishop, buildSpectralChapel } from './chroniclesOfMatthiasSpectralBishop.js';
import { createExperimentalThreeRenderer } from './experimentalThreeRenderer.js';

const CELL = 4;
const CAMERA_Y = 1.62;
const TORCH_WALL_OFFSET = 1.9;
const ATTACK_FX = Object.freeze({
  matthias: Object.freeze({ color: 0xd5aa62, angle: -0.18, width: 0.9, ring: 0.78 }),
  rook: Object.freeze({ color: 0xc96a3e, angle: 0.04, width: 1.3, ring: 1.18 }),
  bishop: Object.freeze({ color: 0xf0c66d, angle: 0.72, width: 1.05, ring: 0.92 }),
  knight: Object.freeze({ color: 0x8da8bd, angle: -0.62, width: 1.12, ring: 0.86 }),
});

export const CHRONICLES_TORCH_PLACEMENTS = Object.freeze([
  Object.freeze({ x: 1, y: 5, side: 'west' }),
  Object.freeze({ x: 2, y: 5, side: 'north', intensity: 0.5, flameScale: 0.68 }),
  Object.freeze({ x: 4, y: 5, side: 'south', intensity: 0.72, flameScale: 0.82 }),
  Object.freeze({ x: 5, y: 5, side: 'east' }),
  Object.freeze({ x: 1, y: 3, side: 'west' }),
  Object.freeze({ x: 5, y: 3, side: 'east' }),
  Object.freeze({ x: 2, y: 1, side: 'north' }),
  Object.freeze({ x: 5, y: 1, side: 'north' }),
]);

function worldForCell(x, y) {
  return new THREE.Vector3((x - 3) * CELL, CAMERA_Y, (y - 3) * CELL);
}

export function chroniclesTorchTransform(x, y, side) {
  const cell = worldForCell(x, y);
  const faces = {
    west: { dx: -TORCH_WALL_OFFSET, dz: 0, yaw: 0 },
    east: { dx: TORCH_WALL_OFFSET, dz: 0, yaw: Math.PI },
    north: { dx: 0, dz: -TORCH_WALL_OFFSET, yaw: -Math.PI / 2 },
    south: { dx: 0, dz: TORCH_WALL_OFFSET, yaw: Math.PI / 2 },
  };
  const face = faces[side];
  if (!face) throw new Error(`Unknown Chronicles torch wall side: ${side}`);
  return {
    position: new THREE.Vector3(cell.x + face.dx, 2.12, cell.z + face.dz),
    yaw: face.yaw,
  };
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

  const enemyModels = {
    'corrupted-pawn': buildCorruptedPawn({ coarsePointer }),
    'gate-jailer': buildGateJailer({ coarsePointer }),
    'spectral-bishop': buildSpectralBishop({ coarsePointer }),
    'scavenger-knight': buildScavengerKnight({ coarsePointer }),
  };
  CHRONICLES_ENEMIES.forEach((enemyDefinition) => {
    const enemy = enemyModels[enemyDefinition.id];
    if (!enemy) return;
    const enemyCell = worldForCell(enemyDefinition.x, enemyDefinition.y);
    enemy.position.set(enemyCell.x, 0, enemyCell.z);
    enemy.scale.setScalar(enemyDefinition.id === 'gate-jailer' ? 1.16 : 1.08);
    enemy.rotation.y = enemyDefinition.id === 'gate-jailer' ? 0 : Math.PI;
    enemy.userData.chroniclesBaseYaw = enemy.rotation.y;
    enemy.userData.chroniclesBaseScale = enemy.scale.x;
    enemy.userData.chroniclesTargetPosition = new THREE.Vector3(enemyCell.x, 0, enemyCell.z);
    scene.add(enemy);
  });

  const spectralChapel = buildSpectralChapel({ coarsePointer });
  const spectralChapelCell = worldForCell(5, 3);
  spectralChapel.position.set(spectralChapelCell.x, 0, spectralChapelCell.z);
  scene.add(spectralChapel);

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
  CHRONICLES_TORCH_PLACEMENTS.forEach(({ x, y, side, intensity = 1, flameScale = 1 }, index) => {
    const transform = chroniclesTorchTransform(x, y, side);
    const root = new THREE.Group();
    root.name = `chronicles-wall-torch-${index}`;

    const wallPlate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.3), torchMaterial);
    wallPlate.position.x = -0.035;
    wallPlate.castShadow = true;
    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.72, 8), torchMaterial);
    bracket.position.x = 0.2;
    bracket.rotation.z = Math.PI / 2;
    bracket.castShadow = true;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), flameMaterial);
    flame.scale.set(0.92 * flameScale, 1.76 * flameScale, 0.92 * flameScale);
    flame.position.set(0.51, 0.2, 0);
    const baseIntensity = (coarsePointer ? 1.5 : 1.95) * intensity;
    const light = new THREE.PointLight(0xff7a32, baseIntensity, 9.5, 2);
    light.position.set(0.51, 0.2, 0);
    if (!coarsePointer && (index === 2 || index === 3)) {
      light.castShadow = true;
      light.shadow.mapSize.set(256, 256);
      light.shadow.bias = -0.001;
      light.shadow.normalBias = 0.04;
    }
    root.add(wallPlate, bracket, flame, light);
    root.position.copy(transform.position);
    root.rotation.y = transform.yaw;
    scene.add(root);
    torches.push({ root, flame, light, baseIntensity, flameScale, phase: index * 1.7 });
  });

  return { enemies: enemyModels, spectralChapel, sigilMaterial, gateMaterial, gateRune, torches };
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = alpha ? 1.02 : coarsePointer ? 1.14 : 1.08;
  renderer.setClearColor(0x080706, alpha ? 0 : 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.2 : 1.65));
  renderer.shadowMap.enabled = !coarsePointer;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

function createCombatFx(camera) {
  const group = new THREE.Group();
  group.name = 'chronicles-combat-fx';
  group.visible = false;

  const slashMaterial = new THREE.MeshBasicMaterial({ color: 0xd5aa62, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const ringMaterial = slashMaterial.clone();
  const slash = new THREE.Mesh(new THREE.BoxGeometry(1, 0.035, 0.035), slashMaterial);
  slash.position.set(0, -0.12, -1.12);
  slash.renderOrder = 20;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.022, 8, 28), ringMaterial);
  ring.position.set(0, 0.02, -1.18);
  ring.renderOrder = 20;
  group.add(slash, ring);
  camera.add(group);

  return { group, slash, ring, slashMaterial, ringMaterial };
}

export function createChroniclesOfMatthiasGame(host, { onReady } = {}) {
  if (!host) throw new Error('Chronicles of Matthias requires a host element');

  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const renderer = createExperimentalThreeRenderer({ antialias: !coarse, alpha: false, powerPreference: 'high-performance' });
  configureRenderer(renderer, { coarsePointer: coarse });
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0c0f, coarse ? 0.038 : 0.034);
  scene.add(new THREE.HemisphereLight(0x6f8191, 0x1b130d, coarse ? 0.35 : 0.24));
  const camera = new THREE.PerspectiveCamera(67, 1, 0.08, 70);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const combatFx = createCombatFx(camera);

  const dungeon = createDungeonScene(scene, { coarsePointer: coarse });
  const dressing = buildChroniclesDungeonDressing({ coarsePointer: coarse });
  const atmosphere = buildChroniclesDungeonAtmosphere({ coarsePointer: coarse, reducedMotion });
  scene.add(dressing, atmosphere);
  let destroyed = false;
  let visible = document.visibilityState !== 'hidden';
  let desiredPosition = worldForCell(1, 5);
  let desiredYaw = -Math.PI / 2;
  let latestState = null;
  let frame = 0;
  let attackFxStartedAt = -1;
  let attackFxConfig = ATTACK_FX.matthias;
  const enemyHitStartedAt = new Map();
  const enemyDeathStartedAt = new Map();
  const enemyMoveStartedAt = new Map();
  const enemyMoveFrom = new Map();
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
    const now = clock.getElapsedTime();
    const previousState = latestState;
    CHRONICLES_ENEMIES.forEach((enemyDefinition) => {
      const previousHp = previousState?.[enemyDefinition.hpKey];
      const nextHp = state[enemyDefinition.hpKey];
      if (previousHp != null && nextHp < previousHp) enemyHitStartedAt.set(enemyDefinition.id, now);
      if (!reducedMotion && previousHp > 0 && nextHp === 0) enemyDeathStartedAt.set(enemyDefinition.id, now);
    });
    desiredPosition = worldForCell(state.x, state.y);
    const direction = CHRONICLES_DIRECTIONS[state.direction];
    desiredYaw = Math.atan2(-direction.dx, -direction.dy);
    CHRONICLES_ENEMIES.forEach((enemyDefinition) => {
      const enemy = dungeon.enemies[enemyDefinition.id];
      if (!enemy) return;
      const active = chroniclesEnemyIsActive(state, enemyDefinition);
      const hp = state[enemyDefinition.hpKey];
      const deathStartedAt = enemyDeathStartedAt.get(enemyDefinition.id);
      const currentCell = chroniclesEnemyPosition(state, enemyDefinition);
      let previousCell = previousState ? chroniclesEnemyPosition(previousState, enemyDefinition) : { x: enemyDefinition.x, y: enemyDefinition.y };
      if (enemyDefinition.id === 'scavenger-knight' && previousState?.jailerHp > 0 && state.jailerHp <= 0) {
        previousCell = { x: enemyDefinition.x, y: enemyDefinition.y };
      }
      if (!reducedMotion && (previousCell.x !== currentCell.x || previousCell.y !== currentCell.y)) {
        const from = worldForCell(previousCell.x, previousCell.y);
        from.y = 0;
        enemyMoveFrom.set(enemyDefinition.id, from);
        enemyMoveStartedAt.set(enemyDefinition.id, now);
      }
      const target = worldForCell(currentCell.x, currentCell.y);
      target.y = 0;
      enemy.userData.chroniclesTargetPosition = target;
      if (reducedMotion) enemy.position.copy(target);
      enemy.visible = active && (hp > 0 || (!reducedMotion && deathStartedAt != null));
      const enemyGlow = enemy.userData.chroniclesGlowMaterials || [];
      enemyGlow.forEach((glow) => {
        const baseGlow = enemy.userData.chroniclesBaseGlow || 1.7;
        glow.emissiveIntensity = hp === 1 ? baseGlow + 1.1 : baseGlow;
      });
    });
    latestState = state;
    (dungeon.spectralChapel.userData.chroniclesGlowMaterials || []).forEach((glow) => {
      glow.emissiveIntensity = state.sigilAwake ? 1.25 : 0.18;
    });
    (dungeon.spectralChapel.userData.chroniclesLights || []).forEach((light) => {
      light.intensity = state.sigilAwake ? (coarse ? 0.62 : 1.05) : 0.08;
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

  function playAttack(memberId) {
    if (reducedMotion) return;
    attackFxConfig = ATTACK_FX[memberId] || ATTACK_FX.matthias;
    attackFxStartedAt = clock.getElapsedTime();
    combatFx.slashMaterial.color.setHex(attackFxConfig.color);
    combatFx.ringMaterial.color.setHex(attackFxConfig.color);
    combatFx.slash.rotation.z = attackFxConfig.angle;
    combatFx.slash.scale.set(attackFxConfig.width, 1, 1);
    combatFx.ring.scale.setScalar(attackFxConfig.ring);
    combatFx.group.visible = true;
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
      atmosphere.userData.updateChroniclesAtmosphere?.(time);
      dungeon.torches.forEach((torch) => {
        const pulse = 0.9 + Math.sin(time * 8.5 + torch.phase) * 0.08 + Math.sin(time * 17 + torch.phase) * 0.04;
        torch.light.intensity = torch.baseIntensity * pulse;
        const width = 0.91 + (pulse - 0.9) * 0.42;
        const flameScale = torch.flameScale || 1;
        torch.flame.scale.set(width * flameScale, (1.54 + pulse * 0.24) * flameScale, width * flameScale);
        torch.flame.rotation.z = Math.sin(time * 5.7 + torch.phase) * 0.07;
      });
      CHRONICLES_ENEMIES.forEach((enemyDefinition, index) => {
        const enemy = dungeon.enemies[enemyDefinition.id];
        if (!enemy) return;
        const active = latestState ? chroniclesEnemyIsActive(latestState, enemyDefinition) : enemyDefinition.activation === 'always';
        const hp = latestState?.[enemyDefinition.hpKey] ?? enemyDefinition.maxHp;
        const baseYaw = enemy.userData.chroniclesBaseYaw || 0;
        const baseScale = enemy.userData.chroniclesBaseScale || 1;
        const hitStartedAt = enemyHitStartedAt.get(enemyDefinition.id) ?? -1;
        const deathStartedAt = enemyDeathStartedAt.get(enemyDefinition.id);
        const target = enemy.userData.chroniclesTargetPosition || enemy.position;
        const moveStartedAt = enemyMoveStartedAt.get(enemyDefinition.id) ?? -1;
        const moveFrom = enemyMoveFrom.get(enemyDefinition.id);
        const moveElapsed = time - moveStartedAt;
        let jumpLift = 0;
        let jumpTwist = 0;

        if (moveFrom && moveElapsed >= 0 && moveElapsed < 0.46) {
          const progress = moveElapsed / 0.46;
          const eased = progress * progress * (3 - 2 * progress);
          enemy.position.x = THREE.MathUtils.lerp(moveFrom.x, target.x, eased);
          enemy.position.z = THREE.MathUtils.lerp(moveFrom.z, target.z, eased);
          jumpLift = Math.sin(progress * Math.PI) * 1.35;
          jumpTwist = Math.sin(progress * Math.PI) * 1.05;
        } else {
          enemy.position.x = target.x;
          enemy.position.z = target.z;
        }

        if (active && hp > 0) {
          const hitElapsed = time - hitStartedAt;
          const hitKick = hitElapsed >= 0 && hitElapsed < 0.24 ? Math.sin((hitElapsed / 0.24) * Math.PI) : 0;
          enemy.visible = true;
          enemy.rotation.y = baseYaw + Math.sin(time * 0.9 + index) * 0.1 + hitKick * 0.16 + jumpTwist;
          enemy.rotation.z = hitKick * -0.08;
          enemy.position.y = jumpLift + Math.sin(time * 1.7 + index * 0.8) * 0.018;
          enemy.scale.setScalar(baseScale + hitKick * 0.07);
        } else if (active && deathStartedAt != null) {
          const deathElapsed = time - deathStartedAt;
          if (deathElapsed < 0.5) {
            enemy.visible = true;
            enemy.position.y = -Math.max(0, deathElapsed) * 1.45;
            enemy.rotation.z = Math.max(0, deathElapsed) * 1.4;
            enemy.scale.setScalar(Math.max(baseScale * 0.48, baseScale - Math.max(0, deathElapsed) * 0.72));
          } else {
            enemy.visible = false;
          }
        } else {
          enemy.visible = false;
        }
      });

      const fxElapsed = time - attackFxStartedAt;
      if (fxElapsed >= 0 && fxElapsed < 0.24) {
        const progress = fxElapsed / 0.24;
        combatFx.group.visible = true;
        combatFx.slashMaterial.opacity = (1 - progress) * 0.82;
        combatFx.ringMaterial.opacity = (1 - progress) * 0.54;
        const ringScale = attackFxConfig.ring * (0.7 + progress * 0.9);
        combatFx.ring.scale.setScalar(ringScale);
        combatFx.slash.position.x = (progress - 0.5) * 0.24;
      } else {
        combatFx.group.visible = false;
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
    playAttack,
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
