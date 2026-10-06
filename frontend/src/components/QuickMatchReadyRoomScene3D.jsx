import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createThreeRenderer } from '../threeRenderer.js';
import { buildPiece, disposeObject as disposeBoard3DObject } from './Board3DPieces.js';

export const QUICK_MATCH_READY_ROOM_CAMERA = Object.freeze({
  fov: 34,
  position: Object.freeze([0, 5.72, 13.45]),
  target: Object.freeze([0, 1.55, -1.82]),
});

const READY_ROOM_BACK_RANK = Object.freeze([
  'rook',
  'knight',
  'bishop',
  'queen',
  'king',
  'bishop',
  'knight',
  'rook',
]);

export const QUICK_MATCH_READY_ROOM_STARTING_POSITION = Object.freeze([
  ...READY_ROOM_BACK_RANK.map((type, file) => Object.freeze({ color: 'black', type, file, rank: 0 })),
  ...Array.from({ length: 8 }, (_, file) => Object.freeze({ color: 'black', type: 'pawn', file, rank: 1 })),
  ...Array.from({ length: 8 }, (_, file) => Object.freeze({ color: 'white', type: 'pawn', file, rank: 6 })),
  ...READY_ROOM_BACK_RANK.map((type, file) => Object.freeze({ color: 'white', type, file, rank: 7 })),
]);

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

function addBoard(root, lightSquare, darkSquare, wood, brass) {
  const board = new THREE.Group();
  board.name = 'quick-match-ready-board';

  box(board, [6.92, .24, 6.92], wood, [0, 0, 0], 'board-frame');
  box(board, [6.48, .10, 6.48], brass, [0, .13, 0], 'board-brass-inlay');

  const squareGeo = new THREE.BoxGeometry(.76, .11, .76);
  const light = new THREE.InstancedMesh(squareGeo, lightSquare, 32);
  const dark = new THREE.InstancedMesh(squareGeo, darkSquare, 32);
  const matrix = new THREE.Matrix4();
  let lightIndex = 0;
  let darkIndex = 0;

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      matrix.makeTranslation((file - 3.5) * .76, .20, (rank - 3.5) * .76);
      const target = (rank + file) % 2 === 0 ? light : dark;
      target.setMatrixAt(target === light ? lightIndex++ : darkIndex++, matrix);
    }
  }

  light.instanceMatrix.needsUpdate = true;
  dark.instanceMatrix.needsUpdate = true;
  light.receiveShadow = true;
  dark.receiveShadow = true;
  board.add(light, dark);
  root.add(board);
  return board;
}

const READY_ROOM_PIECE_CODE = Object.freeze({
  pawn: 'p',
  rook: 'r',
  knight: 'n',
  bishop: 'b',
  queen: 'q',
  king: 'k',
});

function addChessPiece(board, descriptor, { lite = false } = {}) {
  const type = READY_ROOM_PIECE_CODE[descriptor.type] || 'p';
  const side = descriptor.color === 'white' ? 'w' : 'b';
  const piece = buildPiece(type, side, 'studio', lite);
  piece.name = `ready-room-piece-${descriptor.color}-${descriptor.type}-${descriptor.file}-${descriptor.rank}`;
  piece.position.set(
    (descriptor.file - 3.5) * .76,
    .255,
    (descriptor.rank - 3.5) * .76,
  );
  piece.scale.multiplyScalar(.76);
  piece.userData.readyRoomCanonicalPiece = true;
  piece.userData.readyRoomSquare = `${descriptor.file}:${descriptor.rank}`;
  board.add(piece);
}

function addStartingPosition(board, { lite = false } = {}) {
  for (const descriptor of QUICK_MATCH_READY_ROOM_STARTING_POSITION) {
    addChessPiece(board, descriptor, { lite });
  }
}

function addChair(root, wood, leather, brass) {
  const chair = new THREE.Group();
  chair.name = 'quick-match-ready-opponent-chair';
  box(chair, [2.45, .36, 1.45], leather, [0, .56, 0], 'chair-seat');
  box(chair, [1.92, 2.08, .30], leather, [0, 1.74, -.68], 'chair-back');
  box(chair, [.17, 2.72, .17], wood, [-1.08, 1.42, -.72], 'chair-post-left');
  box(chair, [.17, 2.72, .17], wood, [1.08, 1.42, -.72], 'chair-post-right');
  box(chair, [2.34, .17, .22], wood, [0, 2.78, -.72], 'chair-top-rail');
  box(chair, [1.75, .07, .08], brass, [0, 2.36, -.52], 'chair-brass-inlay');
  box(chair, [.17, 1.0, .17], wood, [-1.0, .08, .48], 'chair-leg-left');
  box(chair, [.17, 1.0, .17], wood, [1.0, .08, .48], 'chair-leg-right');
  chair.position.set(0, .02, -5.05);
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

function addClock(root, brass, dark, faceMaterial, handMaterial) {
  const clock = new THREE.Group();
  clock.name = 'quick-match-ready-clock';
  box(clock, [2.10, .76, .68], dark, [0, .38, 0], 'clock-body');
  box(clock, [1.98, .06, .72], brass, [0, .73, 0], 'clock-top-trim');
  for (const [index, x] of [-.57, .57].entries()) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .05, 28), brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, .39, .35);
    ring.name = 'clock-ring';
    clock.add(ring);

    const face = new THREE.Mesh(new THREE.CylinderGeometry(.205, .205, .055, 28), faceMaterial);
    face.rotation.x = Math.PI / 2;
    face.position.set(x, .39, .382);
    face.name = 'clock-face';
    clock.add(face);

    const hand = box(clock, [.025, .19, .025], handMaterial, [x, .45, .42], 'clock-hand');
    hand.rotation.z = index === 0 ? -.55 : .38;
    box(clock, [.045, .045, .03], handMaterial, [x, .39, .43], 'clock-pin');
  }
  box(clock, [.48, .10, .34], brass, [-.57, .82, 0], 'clock-button-left');
  box(clock, [.48, .10, .34], brass, [.57, .82, 0], 'clock-button-right');
  clock.position.set(4.45, 1.43, -1.20);
  root.add(clock);
}

function addWindow(root, stone, brass, night, moon) {
  const windowGroup = new THREE.Group();
  windowGroup.name = 'quick-match-ready-window';
  box(windowGroup, [5.6, 4.3, .12], night, [0, 3.30, 0], 'window-night');
  box(windowGroup, [.24, 4.5, .3], stone, [-2.92, 3.30, .04], 'window-jamb-left');
  box(windowGroup, [.24, 4.5, .3], stone, [2.92, 3.30, .04], 'window-jamb-right');
  box(windowGroup, [6.05, .24, .3], stone, [0, 1.05, .04], 'window-sill');
  for (const x of [-.96, 0, .96]) {
    box(windowGroup, [.07, 4.15, .18], stone, [x, 3.30, .12], 'window-mullion-vertical');
  }
  for (const y of [2.65, 3.95]) {
    box(windowGroup, [5.45, .07, .18], stone, [0, y, .12], 'window-mullion-horizontal');
  }
  box(windowGroup, [5.65, .035, .08], brass, [0, 1.14, .16], 'window-brass-sill');

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x9fc9ff,
    transparent: true,
    opacity: .13,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(.62, 20, 14), haloMaterial);
  halo.position.set(1.45, 4.65, .08);
  windowGroup.add(halo);

  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(.40, 24, 16), moon);
  moonMesh.position.set(1.45, 4.65, .2);
  windowGroup.add(moonMesh);

  windowGroup.position.set(0, .05, -6.23);
  root.add(windowGroup);
}

function addBanner(root, x, leather, brass) {
  const banner = new THREE.Group();
  banner.name = 'quick-match-ready-banner';
  box(banner, [1.55, 2.25, .09], leather, [0, 0, 0], 'banner-cloth');
  box(banner, [1.72, .10, .13], brass, [0, 1.15, .04], 'banner-top');
  box(banner, [.11, 1.45, .10], brass, [0, .08, .08], 'banner-mark');
  banner.position.set(x, 4.52, -6.02);
  root.add(banner);
}

function buildRoom({ lite = false } = {}) {
  const root = new THREE.Group();
  root.name = 'quick-match-ready-room';

  const stone = mat(0x3d3936, .03, .90);
  const stoneEdge = mat(0x665d54, .05, .78);
  const wood = mat(0x452516, .10, .42);
  const woodDark = mat(0x24130d, .10, .54);
  const brass = mat(0xb98542, .76, .23);
  const leather = mat(0x441517, .12, .48);
  const clockBody = mat(0x171513, .24, .34);
  const lightSquare = mat(0xd5cec2, .07, .42);
  const darkSquare = mat(0x35373a, .12, .34);
  const clockFace = mat(0xe5d6b7, .02, .52);
  const clockHand = mat(0x251a12, .26, .34);
  const night = new THREE.MeshBasicMaterial({ color: 0x0b2d50 });
  const moon = new THREE.MeshBasicMaterial({ color: 0xe7f1ff });
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

  for (const x of [-5.95, 5.95]) {
    box(root, [3.15, 2.35, .14], woodDark, [x, 1.8, -6.14], 'wall-panel');
    box(root, [2.76, 1.92, .08], leather, [x, 1.8, -6.04], 'wall-panel-inset');
  }
  box(root, [17.0, .08, .12], brass, [0, 3.02, -6.02], 'room-brass-rail');
  addBanner(root, -6.30, leather, brass);
  addBanner(root, 6.30, leather, brass);

  addWindow(root, stoneEdge, brass, night, moon);
  addSconce(root, -5.15, brass, sconceGlow);
  addSconce(root, 5.15, brass, sconceGlow);

  const table = box(root, [11.65, .66, 7.25], wood, [0, .98, -1.12], 'table-top');
  table.rotation.x = -.018;
  box(root, [10.55, .40, 6.32], woodDark, [0, .62, -1.16], 'table-apron');
  box(root, [9.95, .035, 5.80], brass, [0, 1.335, -1.10], 'table-leather-trim');
  box(root, [9.68, .045, 5.53], leather, [0, 1.365, -1.10], 'table-leather-inlay');
  for (const x of [-4.95, 4.95]) {
    for (const z of [-3.18, .82]) box(root, [.52, 1.72, .52], woodDark, [x, .02, z], 'table-leg');
  }

  const board = addBoard(root, lightSquare, darkSquare, woodDark, brass);
  board.position.set(-.30, 1.48, -1.30);
  addStartingPosition(board, { lite });
  addClock(root, brass, clockBody, clockFace, clockHand);
  addChair(root, woodDark, leather, brass);

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(8.9, 5.6),
    mat(0x321012, .01, .94),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, -.035, -1.15);
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
      renderer.toneMappingExposure = 1.98;
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, coarsePointer ? 1 : 1.35));
      renderer.shadowMap.enabled = !coarsePointer;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0b0908, .0064);

      const camera = new THREE.PerspectiveCamera(QUICK_MATCH_READY_ROOM_CAMERA.fov, 1, .1, 70);
      camera.position.set(...QUICK_MATCH_READY_ROOM_CAMERA.position);
      camera.lookAt(...QUICK_MATCH_READY_ROOM_CAMERA.target);

      const hemi = new THREE.HemisphereLight(0x9ab6d5, 0x3b2417, coarsePointer ? 1.12 : 1.58);
      scene.add(hemi);

      const warmLeft = new THREE.PointLight(0xffa654, coarsePointer ? 2.05 : 3.45, 20, 2);
      warmLeft.position.set(-5.55, 4.2, -4.6);
      warmLeft.castShadow = false;
      scene.add(warmLeft);

      const warmRight = new THREE.PointLight(0xffc06b, coarsePointer ? 1.48 : 2.55, 19, 2);
      warmRight.position.set(5.55, 4.0, -4.4);
      warmRight.castShadow = false;
      scene.add(warmRight);

      const moonFill = new THREE.DirectionalLight(0xa1c7f2, 1.42);
      moonFill.position.set(1.5, 6.5, -4.8);
      moonFill.target.position.set(0, 1.1, -1.4);
      scene.add(moonFill, moonFill.target);

      const cameraFill = new THREE.PointLight(0xffd7aa, coarsePointer ? .68 : 1.20, 25, 2);
      cameraFill.position.set(-.35, 4.95, 7.8);
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
      disposeBoard3DObject(room);
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
