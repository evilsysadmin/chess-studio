import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createThreeRenderer } from '../threeRenderer.js';

export const QUICK_MATCH_READY_ROOM_CAMERA = Object.freeze({
  fov: 34,
  position: Object.freeze([0, 5.6, 13.2]),
  target: Object.freeze([0, 1.5, -2.25]),
});

function mat(color, metalness = 0.04, roughness = 0.8, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
}

function box(root, size, material, position, name = '') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.receiveShadow = true;
  mesh.castShadow = /table|chair|clock|piece|frame|pilaster/.test(name);
  mesh.name = name;
  root.add(mesh);
  return mesh;
}

function addBoard(root, lightSquare, darkSquare, trim) {
  const board = new THREE.Group();
  board.name = 'quick-match-ready-board';

  box(board, [6.7, .22, 6.7], trim, [0, 0, 0], 'board-frame');

  const squareGeo = new THREE.BoxGeometry(.76, .09, .76);
  const light = new THREE.InstancedMesh(squareGeo, lightSquare, 32);
  const dark = new THREE.InstancedMesh(squareGeo, darkSquare, 32);
  const matrix = new THREE.Matrix4();
  let lightIndex = 0;
  let darkIndex = 0;

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      matrix.makeTranslation((file - 3.5) * .76, .14, (rank - 3.5) * .76);
      const target = (rank + file) % 2 === 0 ? light : dark;
      target.setMatrixAt(target === light ? lightIndex++ : darkIndex++, matrix);
    }
  }

  light.instanceMatrix.needsUpdate = true;
  dark.instanceMatrix.needsUpdate = true;
  light.receiveShadow = true;
  dark.receiveShadow = true;
  board.add(light, dark);
  board.position.set(-.55, 1.36, -1.45);
  root.add(board);
  return board;
}

function addPawn(root, x, z, material, scale = 1) {
  const pawn = new THREE.Group();
  pawn.name = 'ready-room-piece';
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.22 * scale, .31 * scale, .14 * scale, 18), material);
  base.position.y = .07 * scale;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.13 * scale, .21 * scale, .34 * scale, 18), material);
  body.position.y = .29 * scale;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.12 * scale, .14 * scale, .10 * scale, 18), material);
  neck.position.y = .50 * scale;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17 * scale, 18, 12), material);
  head.position.y = .69 * scale;
  pawn.add(base, body, neck, head);
  pawn.position.set(x, 1.53, z);
  pawn.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  root.add(pawn);
}

function addChair(root, wood, leather) {
  const chair = new THREE.Group();
  chair.name = 'quick-match-ready-opponent-chair';
  box(chair, [2.65, .42, 1.55], leather, [0, .62, 0], 'chair-seat');
  box(chair, [2.78, 2.7, .36], leather, [0, 2.05, -.72], 'chair-back');
  box(chair, [.18, 3.0, .18], wood, [-1.2, 1.45, -.74], 'chair-post-left');
  box(chair, [.18, 3.0, .18], wood, [1.2, 1.45, -.74], 'chair-post-right');
  box(chair, [.18, 1.05, .18], wood, [-1.1, .1, .5], 'chair-leg-left');
  box(chair, [.18, 1.05, .18], wood, [1.1, .1, .5], 'chair-leg-right');
  chair.position.set(0, .05, -5.0);
  root.add(chair);
}

function addSconce(root, x, brass, glow) {
  const sconce = new THREE.Group();
  sconce.name = 'quick-match-ready-sconce';
  box(sconce, [.48, .66, .12], brass, [0, 0, 0], 'sconce-plate');
  box(sconce, [.10, .48, .34], brass, [0, -.28, .18], 'sconce-arm');
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.19, 18, 12), glow);
  lamp.scale.set(1, 1.22, 1);
  lamp.position.set(0, -.46, .42);
  lamp.name = 'sconce-lamp';
  sconce.add(lamp);
  sconce.position.set(x, 4.45, -6.08);
  root.add(sconce);
}

function addClock(root, brass, dark) {
  const clock = new THREE.Group();
  clock.name = 'quick-match-ready-clock';
  box(clock, [2.15, .72, .64], dark, [0, .36, 0], 'clock-body');
  for (const x of [-.57, .57]) {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .045, 28), brass);
    face.rotation.x = Math.PI / 2;
    face.position.set(x, .39, .34);
    face.name = 'clock-face';
    clock.add(face);
  }
  box(clock, [.48, .10, .32], brass, [-.57, .78, 0], 'clock-button-left');
  box(clock, [.48, .10, .32], brass, [.57, .78, 0], 'clock-button-right');
  clock.position.set(4.25, 1.42, -1.15);
  root.add(clock);
}

function addWindow(root, stone, brass, night, moon) {
  const windowGroup = new THREE.Group();
  windowGroup.name = 'quick-match-ready-window';
  box(windowGroup, [5.2, 3.9, .12], night, [0, 3.25, 0], 'window-night');
  box(windowGroup, [.22, 4.15, .3], stone, [-2.7, 3.25, .04], 'window-jamb-left');
  box(windowGroup, [.22, 4.15, .3], stone, [2.7, 3.25, .04], 'window-jamb-right');
  box(windowGroup, [5.6, .22, .3], stone, [0, 1.14, .04], 'window-sill');
  box(windowGroup, [.10, 3.9, .22], brass, [0, 3.25, .12], 'window-mullion');

  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(.30, 24, 16), moon);
  moonMesh.position.set(1.55, 4.55, .2);
  windowGroup.add(moonMesh);

  windowGroup.position.set(0, .05, -6.23);
  root.add(windowGroup);
}

function buildRoom({ lite = false } = {}) {
  const root = new THREE.Group();
  root.name = 'quick-match-ready-room';

  const stone = mat(0x353230, .02, .92);
  const stoneEdge = mat(0x59534b, .03, .86);
  const wood = mat(0x5a341e, .04, .69);
  const woodDark = mat(0x2d190f, .02, .80);
  const brass = mat(0xb98f48, .66, .31);
  const leather = mat(0x44231e, .08, .70);
  const ivory = mat(0xd3c6a5, .02, .62);
  const ebony = mat(0x171514, .12, .52);
  const lightSquare = mat(0xc4b58d, .03, .74);
  const darkSquare = mat(0x3f3327, .04, .70);
  const night = new THREE.MeshBasicMaterial({ color: 0x0b2039 });
  const moon = new THREE.MeshBasicMaterial({ color: 0xc7dcf5 });
  const sconceGlow = new THREE.MeshStandardMaterial({
    color: 0xffc987,
    emissive: 0xff7f2f,
    emissiveIntensity: 2.6,
    metalness: 0,
    roughness: .32,
  });

  box(root, [18, .45, 14], stone, [0, -.27, -1.0], 'floor');
  box(root, [18, 7.2, .42], stone, [0, 3.25, -6.45], 'back-wall');
  box(root, [.42, 7.2, 12], stone, [-8.8, 3.25, -.7], 'left-wall');
  box(root, [.42, 7.2, 12], stone, [8.8, 3.25, -.7], 'right-wall');

  for (const x of [-7.8, -3.2, 3.2, 7.8]) {
    box(root, [.30, 6.7, .46], stoneEdge, [x, 3.15, -6.13], 'pilaster');
  }

  addWindow(root, stoneEdge, brass, night, moon);
  addSconce(root, -5.55, brass, sconceGlow);
  addSconce(root, 5.55, brass, sconceGlow);

  const table = box(root, [10.7, .62, 5.1], wood, [0, 1.02, -1.15], 'table-top');
  table.rotation.x = -.025;
  box(root, [9.6, .38, 4.25], woodDark, [0, .68, -1.18], 'table-apron');
  for (const x of [-4.55, 4.55]) {
    for (const z of [-2.5, .2]) box(root, [.46, 1.75, .46], woodDark, [x, .05, z], 'table-leg');
  }

  addBoard(root, lightSquare, darkSquare, brass);
  addClock(root, brass, ebony);
  addChair(root, woodDark, leather);

  if (!lite) {
    for (let file = 0; file < 8; file += 1) {
      const x = -.55 + (file - 3.5) * .76;
      addPawn(root, x, -1.45 + 2.28, ivory, .72);
      addPawn(root, x, -1.45 - 2.28, ebony, .72);
    }
  } else {
    for (const file of [1, 3, 4, 6]) {
      const x = -.55 + (file - 3.5) * .76;
      addPawn(root, x, -1.45 + 2.28, ivory, .72);
      addPawn(root, x, -1.45 - 2.28, ebony, .72);
    }
  }

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(10.4, 7.2),
    mat(0x4d1718, .01, .96),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, -.035, -1.25);
  rug.receiveShadow = true;
  root.add(rug);

  return root;
}

function renderScene(renderer, scene, camera, host) {
  if (!renderer || !scene || !camera || !host) return;
  const rect = host.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

export default function QuickMatchReadyRoomScene3D() {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const host = canvas.parentElement;
    const width = Math.max(0, Number(globalThis.innerWidth) || host?.clientWidth || 0);
    const height = Math.max(0, Number(globalThis.innerHeight) || host?.clientHeight || 0);

    if (width < 720 || height < 520) {
      setStatus('fallback-mobile');
      return undefined;
    }

    const coarsePointer = Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches);
    let renderer;
    let scene;
    let room;
    let observer;
    let onResize;

    try {
      renderer = createThreeRenderer({
        canvas,
        alpha: true,
        antialias: !coarsePointer,
        powerPreference: coarsePointer ? 'low-power' : 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.85;
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, coarsePointer ? 1 : 1.35));
      renderer.shadowMap.enabled = !coarsePointer;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0b0908, .0085);

      const camera = new THREE.PerspectiveCamera(QUICK_MATCH_READY_ROOM_CAMERA.fov, 1, .1, 70);
      camera.position.set(...QUICK_MATCH_READY_ROOM_CAMERA.position);
      camera.lookAt(...QUICK_MATCH_READY_ROOM_CAMERA.target);

      const hemi = new THREE.HemisphereLight(0x8ca8ca, 0x2d1a10, coarsePointer ? 1.0 : 1.34);
      scene.add(hemi);

      const warmLeft = new THREE.PointLight(0xffa654, coarsePointer ? 1.85 : 2.85, 19, 2);
      warmLeft.position.set(-5.55, 4.2, -4.6);
      warmLeft.castShadow = false;
      scene.add(warmLeft);

      const warmRight = new THREE.PointLight(0xffc06b, coarsePointer ? 1.3 : 2.05, 18, 2);
      warmRight.position.set(5.55, 4.0, -4.4);
      warmRight.castShadow = false;
      scene.add(warmRight);

      const moonFill = new THREE.DirectionalLight(0x91b7ea, 1.18);
      moonFill.position.set(1.5, 6.5, -4.8);
      moonFill.target.position.set(0, 1.1, -1.4);
      scene.add(moonFill, moonFill.target);

      const cameraFill = new THREE.PointLight(0xffd7aa, coarsePointer ? .58 : 1.02, 25, 2);
      cameraFill.position.set(0, 4.8, 8.5);
      cameraFill.castShadow = false;
      scene.add(cameraFill);

      room = buildRoom({ lite: coarsePointer });
      scene.add(room);

      const draw = () => renderScene(renderer, scene, camera, host);
      draw();

      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(draw);
        observer.observe(host);
      } else {
        onResize = draw;
        globalThis.addEventListener?.('resize', onResize);
      }

      setStatus('ready');
    } catch {
      setStatus('fallback');
    }

    return () => {
      observer?.disconnect?.();
      if (onResize) globalThis.removeEventListener?.('resize', onResize);
      if (room) scene?.remove?.(room);
      renderer?.dispose?.();
      room?.traverse?.((node) => {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach((entry) => entry?.dispose?.());
        else node.material?.dispose?.();
      });
    };
  }, []);

  return (
    <div
      className={`quick-match-ready-room__scene is-${status}`}
      data-quick-match-ready-room-3d={status}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
