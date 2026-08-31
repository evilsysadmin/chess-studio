import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Board from './Board.jsx';
import { loadBoardTheme } from '../career.js';
import { loadSelectedSkin } from '../tournamentRewards.js';
import { USER_PREFERENCES_CHANGED_EVENT, getEffectiveReducedMotion } from '../userPreferences.js';
import './Board3D.css';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const DISPLAY_RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
const BOARD_CAMERA_HALF_SPAN = 5.05;
const BOARD_CAMERA_PADDING = 1.06;

const BOARD_THEME_3D = Object.freeze({
  classic: { light: 0xd9cfba, dark: 0x5a4236, frame: 0x34251f, felt: 0x111722, glow: 0xc9a227 },
  midnight: { light: 0xaab2bd, dark: 0x263244, frame: 0x111824, felt: 0x080d16, glow: 0x6f9fc5 },
  blood: { light: 0xc9b5a6, dark: 0x5d2926, frame: 0x2b1515, felt: 0x12090a, glow: 0xb4483a },
  royal: { light: 0xd8c990, dark: 0x493564, frame: 0x221b32, felt: 0x0d0b15, glow: 0xe0b84e },
  forensic: { light: 0xc6d2ce, dark: 0x40515a, frame: 0x1c262b, felt: 0x0a1013, glow: 0x63c0ba },
  obsidian: { light: 0xb5b0a8, dark: 0x202225, frame: 0x0c0d0f, felt: 0x050607, glow: 0xc7a34a },
});

const SKIN_3D = Object.freeze({
  default: {
    white: 0xe7d7ad, black: 0x2b2d31, whiteAccent: 0xb68a38, blackAccent: 0x9b342f,
    metalness: 0.18, roughness: 0.62, emissive: 0x000000, emissiveIntensity: 0,
  },
  studio: {
    white: 0xf0eadc, black: 0x262a30, whiteAccent: 0xc7a34a, blackAccent: 0x8f312e,
    metalness: 0.26, roughness: 0.48, emissive: 0x000000, emissiveIntensity: 0,
  },
  regimiento: {
    white: 0xf2e1bd, black: 0x313238, whiteAccent: 0xc79b43, blackAccent: 0xa62e2a,
    metalness: 0.44, roughness: 0.38, emissive: 0x000000, emissiveIntensity: 0,
  },
  azul: {
    white: 0xd8e2e8, black: 0x1f3344, whiteAccent: 0x6f9fc5, blackAccent: 0x366c94,
    metalness: 0.32, roughness: 0.44, emissive: 0x000000, emissiveIntensity: 0,
  },
  shogunate: {
    white: 0xe9e0cf, black: 0x162236, whiteAccent: 0xc33d45, blackAccent: 0x305ea8,
    metalness: 0.5, roughness: 0.32, emissive: 0x142f70, emissiveIntensity: 0.12,
  },
  esmeralda: {
    white: 0xd9dcc9, black: 0x23372e, whiteAccent: 0x759b68, blackAccent: 0x36634d,
    metalness: 0.28, roughness: 0.5, emissive: 0x000000, emissiveIntensity: 0,
  },
  cyber: {
    white: 0xcbd6df, black: 0x151b23, whiteAccent: 0x53b7d8, blackAccent: 0x7f3dcc,
    metalness: 0.72, roughness: 0.24, emissive: 0x297ea7, emissiveIntensity: 0.18,
  },
  marines: {
    white: 0xc9c5ad, black: 0x2d352f, whiteAccent: 0x9f8b52, blackAccent: 0x526b4e,
    metalness: 0.34, roughness: 0.64, emissive: 0x000000, emissiveIntensity: 0,
  },
  delta: {
    white: 0xbfc2c3, black: 0x151718, whiteAccent: 0x922c2a, blackAccent: 0x721f20,
    metalness: 0.5, roughness: 0.34, emissive: 0x641414, emissiveIntensity: 0.12,
  },
});

function parseFen(fen) {
  const rows = String(fen || '').trim().split(/\s+/)[0]?.split('/') || [];
  if (rows.length !== 8) return [];
  const pieces = [];
  rows.forEach((row, rankIndex) => {
    let fileIndex = 0;
    for (const char of row) {
      if (/^[1-8]$/.test(char)) {
        fileIndex += Number(char);
      } else if (/^[prnbqkPRNBQK]$/.test(char) && fileIndex < 8) {
        pieces.push({
          square: `${FILES[fileIndex]}${8 - rankIndex}`,
          type: char.toLowerCase(),
          color: char === char.toUpperCase() ? 'w' : 'b',
        });
        fileIndex += 1;
      }
    }
  });
  return pieces;
}

function squarePosition(square) {
  const file = FILES.indexOf(square?.[0]);
  const rank = Number(square?.[1]);
  return { x: file - 3.5, z: 4.5 - rank };
}

function adjacentSquare(square, key, orientation) {
  const fileIndex = FILES.indexOf(square?.[0]);
  const rankIndex = DISPLAY_RANKS.indexOf(square?.[1]);
  if (fileIndex < 0 || rankIndex < 0) return null;
  let df = 0;
  let dr = 0;
  if (key === 'ArrowRight') df = 1;
  else if (key === 'ArrowLeft') df = -1;
  else if (key === 'ArrowUp') dr = -1;
  else if (key === 'ArrowDown') dr = 1;
  else return null;
  if (orientation === 'black') { df *= -1; dr *= -1; }
  const nextFile = fileIndex + df;
  const nextRank = rankIndex + dr;
  if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) return null;
  return `${FILES[nextFile]}${DISPLAY_RANKS[nextRank]}`;
}

function makeMaterial(color, skin, accent = false) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: Math.min(1, skin.metalness + (accent ? 0.12 : 0)),
    roughness: Math.max(0.12, skin.roughness - (accent ? 0.08 : 0)),
    emissive: skin.emissive,
    emissiveIntensity: accent ? skin.emissiveIntensity * 1.2 : skin.emissiveIntensity,
  });
}

function addMesh(group, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function buildPiece(type, color, skinId) {
  const skin = SKIN_3D[skinId] || SKIN_3D.studio;
  const main = makeMaterial(color === 'w' ? skin.white : skin.black, skin);
  const accent = makeMaterial(color === 'w' ? skin.whiteAccent : skin.blackAccent, skin, true);
  const group = new THREE.Group();

  addMesh(group, new THREE.CylinderGeometry(0.31, 0.35, 0.13, 24), main, [0, 0.065, 0]);
  addMesh(group, new THREE.CylinderGeometry(0.24, 0.3, 0.09, 24), accent, [0, 0.16, 0]);

  if (type === 'p') {
    addMesh(group, new THREE.CylinderGeometry(0.13, 0.21, 0.31, 20), main, [0, 0.34, 0]);
    addMesh(group, new THREE.SphereGeometry(0.17, 20, 14), main, [0, 0.57, 0]);
    addMesh(group, new THREE.TorusGeometry(0.145, 0.026, 8, 24), accent, [0, 0.49, 0], [Math.PI / 2, 0, 0]);
  } else if (type === 'n') {
    addMesh(group, new THREE.CylinderGeometry(0.15, 0.23, 0.32, 18), main, [0, 0.34, 0]);
    addMesh(group, new THREE.BoxGeometry(0.27, 0.34, 0.38), main, [0, 0.61, 0.07], [-0.34, 0, 0]);
    addMesh(group, new THREE.ConeGeometry(0.07, 0.18, 10), accent, [-0.08, 0.86, -0.02], [0.2, 0, -0.25]);
    addMesh(group, new THREE.ConeGeometry(0.07, 0.18, 10), accent, [0.08, 0.86, -0.02], [0.2, 0, 0.25]);
  } else if (type === 'b') {
    addMesh(group, new THREE.ConeGeometry(0.22, 0.58, 24), main, [0, 0.46, 0]);
    addMesh(group, new THREE.SphereGeometry(0.11, 16, 12), accent, [0, 0.78, 0]);
    addMesh(group, new THREE.BoxGeometry(0.045, 0.2, 0.14), main, [0.03, 0.81, 0], [0, 0, 0.55]);
  } else if (type === 'r') {
    addMesh(group, new THREE.CylinderGeometry(0.23, 0.27, 0.49, 20), main, [0, 0.4, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.29, 0.25, 0.13, 12), accent, [0, 0.7, 0]);
    for (const [x, z] of [[0.17, 0.17], [-0.17, 0.17], [0.17, -0.17], [-0.17, -0.17]]) {
      addMesh(group, new THREE.BoxGeometry(0.12, 0.14, 0.12), main, [x, 0.8, z]);
    }
  } else if (type === 'q') {
    addMesh(group, new THREE.ConeGeometry(0.24, 0.7, 24), main, [0, 0.49, 0]);
    addMesh(group, new THREE.TorusGeometry(0.17, 0.035, 10, 28), accent, [0, 0.83, 0], [Math.PI / 2, 0, 0]);
    for (let index = 0; index < 5; index += 1) {
      const angle = index * (Math.PI * 2 / 5);
      addMesh(group, new THREE.SphereGeometry(0.055, 12, 9), accent, [Math.cos(angle) * 0.16, 0.92, Math.sin(angle) * 0.16]);
    }
  } else if (type === 'k') {
    addMesh(group, new THREE.CylinderGeometry(0.2, 0.27, 0.69, 22), main, [0, 0.48, 0]);
    addMesh(group, new THREE.TorusGeometry(0.17, 0.035, 10, 28), accent, [0, 0.82, 0], [Math.PI / 2, 0, 0]);
    addMesh(group, new THREE.BoxGeometry(0.07, 0.29, 0.07), accent, [0, 1.02, 0]);
    addMesh(group, new THREE.BoxGeometry(0.23, 0.07, 0.07), accent, [0, 1.0, 0]);
  }

  return group;
}

function disposeObject(object) {
  const disposedMaterials = new Set();
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material || disposedMaterials.has(material)) continue;
      disposedMaterials.add(material);
      material.dispose?.();
    }
  });
}

function makeTextSprite(text, color = '#e7dcc0') {
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

function fitBoardCamera(camera, width, height, whiteSide) {
  const aspect = Math.max(0.35, width / Math.max(1, height));
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance = THREE.MathUtils.clamp(
    (BOARD_CAMERA_HALF_SPAN / Math.tan(limitingFov / 2)) * BOARD_CAMERA_PADDING,
    12.8,
    22.5,
  );
  const target = new THREE.Vector3(0, 0.12, 0);
  const direction = new THREE.Vector3(0, 7.23, whiteSide ? 7.75 : -7.75).normalize();
  camera.aspect = aspect;
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

function Board3DCanvas({
  fen,
  onSquareClick,
  selectedSquare,
  legalTargets = [],
  lastMove,
  orientation = 'white',
  animate,
  hintMove,
  checkSquare,
  showCoordinates = true,
  onCustomize,
  onRendererFailure,
}) {
  const hostRef = useRef(null);
  const sceneStateRef = useRef(null);
  const pointerStartRef = useRef(null);
  const latestPropsRef = useRef({});
  const animationFrameRef = useRef(0);
  const lastAnimatedSeqRef = useRef(0);
  const [skinId, setSkinId] = useState(() => loadSelectedSkin());
  const [boardTheme, setBoardTheme] = useState(() => loadBoardTheme());
  const [rendererLabel, setRendererLabel] = useState('3D');
  const [focusedSquare, setFocusedSquare] = useState(() => orientation === 'black' ? 'e8' : 'e1');

  latestPropsRef.current = { onSquareClick, onRendererFailure };

  useEffect(() => {
    const refreshSkin = (event) => setSkinId(event?.detail || loadSelectedSkin());
    const refreshPreferences = () => setBoardTheme(loadBoardTheme());
    window.addEventListener('chess-piece-skin-change', refreshSkin);
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshPreferences);
    return () => {
      window.removeEventListener('chess-piece-skin-change', refreshSkin);
      window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshPreferences);
    };
  }, []);

  useEffect(() => {
    setFocusedSquare(orientation === 'black' ? 'e8' : 'e1');
  }, [orientation]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
      latestPropsRef.current.onRendererFailure?.(error);
      return undefined;
    }

    const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const squareMeshes = new Map();
    const highlightMeshes = new Map();
    const pieceMeshes = new Map();
    const pieceGroup = new THREE.Group();
    const coordinateGroup = new THREE.Group();
    const boardGroup = new THREE.Group();
    const theme = BOARD_THEME_3D[boardTheme] || BOARD_THEME_3D.classic;

    scene.background = new THREE.Color(theme.felt);
    scene.fog = new THREE.FogExp2(theme.felt, 0.035);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.35 : 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = 'board3d-main-canvas';
    renderer.domElement.setAttribute('aria-label', 'Tablero de ajedrez 3D. Cámara fija desde tu lado. Usa flechas y Enter para jugar con teclado.');
    renderer.domElement.setAttribute('role', 'application');
    renderer.domElement.tabIndex = 0;
    renderer.domElement.style.touchAction = 'manipulation';
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xfff1d4, 0x192131, 1.25));
    const key = new THREE.DirectionalLight(0xffefd0, 2.1);
    key.position.set(-4.5, 9, 5.5);
    key.castShadow = true;
    key.shadow.mapSize.set(coarsePointer ? 512 : 1024, coarsePointer ? 512 : 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    scene.add(key);
    const rim = new THREE.PointLight(theme.glow, 15, 18, 2);
    rim.position.set(4.2, 3.2, -4.2);
    scene.add(rim);

    const pedestal = new THREE.Mesh(
      new THREE.BoxGeometry(9.15, 0.42, 9.15),
      new THREE.MeshStandardMaterial({ color: theme.frame, metalness: 0.22, roughness: 0.56 }),
    );
    pedestal.position.y = -0.22;
    pedestal.receiveShadow = true;
    boardGroup.add(pedestal);

    for (let rank = 1; rank <= 8; rank += 1) {
      for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
        const square = `${FILES[fileIndex]}${rank}`;
        const { x, z } = squarePosition(square);
        const light = (rank + fileIndex) % 2 === 1;
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(0.985, 0.075, 0.985),
          new THREE.MeshStandardMaterial({ color: light ? theme.light : theme.dark, metalness: 0.05, roughness: 0.72 }),
        );
        tile.position.set(x, 0.035, z);
        tile.receiveShadow = true;
        tile.userData.square = square;
        boardGroup.add(tile);
        squareMeshes.set(square, tile);

        const marker = new THREE.Mesh(
          new THREE.RingGeometry(0.29, 0.43, 32),
          new THREE.MeshBasicMaterial({ color: 0xc9a227, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false }),
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(x, 0.084, z);
        marker.visible = false;
        marker.renderOrder = 4;
        boardGroup.add(marker);
        highlightMeshes.set(square, marker);
      }
    }

    boardGroup.add(pieceGroup);
    boardGroup.add(coordinateGroup);
    scene.add(boardGroup);

    const whiteSide = orientation !== 'black';
    camera.position.set(0, 9.2, whiteSide ? 9.8 : -9.8);
    camera.lookAt(0, 0.12, 0);

    if (showCoordinates) {
      const fileOrder = whiteSide ? FILES : [...FILES].reverse();
      const rankOrder = whiteSide ? ['1','2','3','4','5','6','7','8'] : ['8','7','6','5','4','3','2','1'];
      fileOrder.forEach((file, index) => {
        const sprite = makeTextSprite(file.toUpperCase());
        sprite.position.set(index - 3.5, 0.11, whiteSide ? 4.62 : -4.62);
        coordinateGroup.add(sprite);
      });
      rankOrder.forEach((rank, index) => {
        const sprite = makeTextSprite(rank);
        sprite.position.set(whiteSide ? -4.62 : 4.62, 0.11, whiteSide ? 3.5 - index : -3.5 + index);
        coordinateGroup.add(sprite);
      });
    }

    function render() {
      renderer.render(scene, camera);
    }

    function resize() {
      const width = Math.max(280, host.clientWidth || 280);
      const height = Math.max(300, host.clientHeight || 300);
      renderer.setSize(width, height, false);
      fitBoardCamera(camera, width, height, whiteSide);
      render();
    }
    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(host);

    function squareFromPointer(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects([...pieceGroup.children, ...squareMeshes.values()], true);
      for (const hit of intersections) {
        let object = hit.object;
        while (object && !object.userData?.square) object = object.parent;
        if (object?.userData?.square) return object.userData.square;
      }
      return null;
    }

    function onPointerDown(event) {
      pointerStartRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    }

    function onPointerUp(event) {
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (!start || start.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
      const square = squareFromPointer(event);
      if (!square) return;
      setFocusedSquare(square);
      latestPropsRef.current.onSquareClick?.(square);
    }

    function onContextLost(event) {
      event.preventDefault();
      latestPropsRef.current.onRendererFailure?.(new Error('WebGL context lost'));
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown, { passive: true });
    renderer.domElement.addEventListener('pointerup', onPointerUp, { passive: true });
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);

    sceneStateRef.current = {
      scene,
      camera,
      renderer,
      pieceGroup,
      pieceMeshes,
      highlightMeshes,
      render,
    };
    setRendererLabel(renderer.capabilities.isWebGL2 ? '3D · WEBGL2' : '3D · WEBGL');
    render();

    return () => {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      observer?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((object) => {
        if (object.userData?.ownedTexture) object.userData.ownedTexture.dispose();
      });
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      sceneStateRef.current = null;
    };
  }, [boardTheme, orientation, showCoordinates]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = 0;

    for (const child of [...state.pieceGroup.children]) {
      state.pieceGroup.remove(child);
      disposeObject(child);
    }
    state.pieceMeshes.clear();

    for (const piece of parseFen(fen)) {
      const mesh = buildPiece(piece.type, piece.color, skinId);
      const { x, z } = squarePosition(piece.square);
      mesh.position.set(x, 0.08, z);
      mesh.userData.square = piece.square;
      mesh.traverse((object) => { object.userData.square = piece.square; });
      state.pieceGroup.add(mesh);
      state.pieceMeshes.set(piece.square, mesh);
    }

    const animatedMesh = animate?.to ? state.pieceMeshes.get(animate.to) : null;
    const shouldAnimate = Boolean(
      animatedMesh
      && animate?.from
      && animate?.to
      && animate?.seq
      && animate.seq !== lastAnimatedSeqRef.current
      && !getEffectiveReducedMotion(),
    );

    if (!shouldAnimate) {
      if (animate?.seq) lastAnimatedSeqRef.current = animate.seq;
      state.render();
      return;
    }

    lastAnimatedSeqRef.current = animate.seq;
    const from = squarePosition(animate.from);
    const to = squarePosition(animate.to);
    const start = performance.now();
    const duration = animate.kind === 'miss' ? 300 : 190;

    function frame(now) {
      const raw = Math.min(1, Math.max(0, (now - start) / duration));
      const progress = animate.kind === 'miss'
        ? (raw < 0.5 ? raw * 0.72 : (1 - raw) * 0.72)
        : 1 - Math.pow(1 - raw, 3);
      animatedMesh.position.x = to.x + (from.x - to.x) * (1 - progress);
      animatedMesh.position.z = to.z + (from.z - to.z) * (1 - progress);
      state.render();
      if (raw < 1) animationFrameRef.current = window.requestAnimationFrame(frame);
      else {
        animatedMesh.position.set(to.x, 0.08, to.z);
        state.render();
        animationFrameRef.current = 0;
      }
    }

    animatedMesh.position.set(from.x, 0.08, from.z);
    state.render();
    animationFrameRef.current = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    };
  }, [fen, skinId, animate, boardTheme, orientation, showCoordinates]);

  const legalMap = useMemo(() => new Map((legalTargets || []).map((target) => {
    const square = target?.to || target?.square || target;
    const capture = Boolean(target?.captured || target?.san?.includes?.('x'));
    return [square, capture];
  })), [legalTargets]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    for (const [square, marker] of state.highlightMeshes.entries()) {
      marker.visible = false;
      let color = null;
      let opacity = 0.86;
      if (focusedSquare === square) { color = 0xe8dfc3; opacity = 0.42; }
      if (lastMove && (square === lastMove.from || square === lastMove.to)) color = 0xb9952e;
      if (hintMove && (square === hintMove.from || square === hintMove.to)) color = 0x50a4c6;
      if (legalMap.has(square)) color = legalMap.get(square) ? 0xb4483a : 0x5fa8d3;
      if (selectedSquare === square) { color = 0xe0b84e; opacity = 0.96; }
      if (checkSquare === square) { color = 0xe33b32; opacity = 1; }
      if (color != null) {
        marker.material.color.setHex(color);
        marker.material.opacity = opacity;
        marker.visible = true;
      }
    }
    state.render();
  }, [selectedSquare, legalMap, lastMove, hintMove, checkSquare, focusedSquare, boardTheme, orientation, showCoordinates]);

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSquareClick?.(focusedSquare);
      return;
    }
    const next = adjacentSquare(focusedSquare, event.key, orientation);
    if (!next) return;
    event.preventDefault();
    setFocusedSquare(next);
  }

  return (
    <div className="board3d-main-shell">
      <div ref={hostRef} className="board3d-main-host" onKeyDown={handleKeyDown} />
      <div className="board3d-fixed-camera-note" aria-hidden="true">CÁMARA FIJA · TU LADO</div>
      <div className="board3d-renderer-badge" aria-hidden="true">{rendererLabel}</div>
      {onCustomize && <button type="button" className="board3d-customize secondary-btn" onClick={onCustomize}>Apariencia</button>}
    </div>
  );
}

export default function Board3D(props) {
  const [failed, setFailed] = useState(false);
  const handleRendererFailure = useCallback(() => setFailed(true), []);

  if (failed) {
    return (
      <div className="board3d-fallback">
        <div className="board3d-fallback-note">3D no disponible en este dispositivo · usando 2D</div>
        <Board {...props} />
      </div>
    );
  }

  return <Board3DCanvas {...props} onRendererFailure={handleRendererFailure} />;
}
