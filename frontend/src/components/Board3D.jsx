import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import './Board3D.css';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS_FROM_TOP = ['8', '7', '6', '5', '4', '3', '2', '1'];

const THEME_PALETTES = Object.freeze({
  classic: { light: 0xd8c38f, dark: 0x5a4730, frame: 0x241b13, floor: 0x0b0d11, accent: 0xd6ad53 },
  midnight: { light: 0x778398, dark: 0x273142, frame: 0x111722, floor: 0x070a10, accent: 0x8fb7e8 },
  blood: { light: 0xb69786, dark: 0x5b2527, frame: 0x271114, floor: 0x0e0809, accent: 0xd6645f },
  royal: { light: 0xd5c9a2, dark: 0x534576, frame: 0x1e1830, floor: 0x09070e, accent: 0xd7bd6a },
  forensic: { light: 0xb7c9c4, dark: 0x3d6463, frame: 0x142322, floor: 0x07100f, accent: 0x79d2c4 },
  obsidian: { light: 0x777777, dark: 0x202329, frame: 0x090b0f, floor: 0x030406, accent: 0xd4aa51 },
});

function paletteFor(theme) {
  return THEME_PALETTES[theme] || THEME_PALETTES.classic;
}

function squareToWorld(square, orientation) {
  const fileIndex = FILES.indexOf(square?.[0]);
  const rankIndex = Number(square?.[1]) - 1;
  if (fileIndex < 0 || rankIndex < 0 || rankIndex > 7) return { x: 0, z: 0 };
  if (orientation === 'black') {
    return { x: 3.5 - fileIndex, z: rankIndex - 3.5 };
  }
  return { x: fileIndex - 3.5, z: 3.5 - rankIndex };
}

function gridEntries(grid) {
  const entries = [];
  for (let r = 0; r < 8; r += 1) {
    for (let f = 0; f < 8; f += 1) {
      const piece = grid?.[r]?.[f];
      if (!piece) continue;
      entries.push({ square: `${FILES[f]}${RANKS_FROM_TOP[r]}`, piece });
    }
  }
  return entries;
}

function isCoarsePointer() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
}

function disposeObject(object, { disposeTextures = false } = {}) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material?.dispose?.());
    } else {
      child.material?.dispose?.();
    }
    if (disposeTextures && child.material?.map) child.material.map.dispose?.();
  });
}

export default function Board3D({
  grid,
  pieceImages,
  orientation = 'white',
  theme = 'classic',
  selectedSquare,
  legalTargets = [],
  lastMove,
  hintMove,
  checkSquare,
  animate,
  pieceLevels,
  pieceRankLevels,
  pieceXp,
  pieceLabels,
  onSquareClick,
  onSquareDoubleClick,
  onPieceClick,
  onPieceDoubleClick,
  onUse2D,
  onUnavailable,
}) {
  const hostRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const boardGroupRef = useRef(null);
  const pieceGroupRef = useRef(null);
  const squareMeshesRef = useRef(new Map());
  const pieceObjectsRef = useRef(new Map());
  const texturesRef = useRef(new Map());
  const frameRef = useRef(0);
  const resizeObserverRef = useRef(null);
  const lastAnimatedSeqRef = useRef(0);
  const [ready, setReady] = useState(false);
  const palette = useMemo(() => paletteFor(theme), [theme]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isCoarsePointer(),
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch (error) {
      console.warn('Three.js board unavailable', error);
      onUnavailable?.(error);
      return undefined;
    }

    rendererRef.current = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(palette.floor, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarsePointer() ? 1.35 : 1.8));
    renderer.shadowMap.enabled = !isCoarsePointer();
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label', 'Tablero de ajedrez 3D interactivo');
    host.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(palette.floor, 11, 22);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(0, 7.6, 8.7);
    camera.lookAt(0, 0.15, -0.65);
    cameraRef.current = camera;

    const ambient = new THREE.HemisphereLight(0xfff1cf, 0x111827, 2.15);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffe8b0, 3.1);
    key.position.set(-4.5, 9, 6.5);
    key.castShadow = renderer.shadowMap.enabled;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x91b5ff, 1.15);
    rim.position.set(5, 4, -7);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(10.5, 64),
      new THREE.MeshStandardMaterial({ color: palette.floor, roughness: 0.95, metalness: 0.04 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.18;
    floor.receiveShadow = true;
    scene.add(floor);

    const boardGroup = new THREE.Group();
    boardGroupRef.current = boardGroup;
    scene.add(boardGroup);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(9.15, 0.24, 9.15),
      new THREE.MeshStandardMaterial({ color: palette.frame, roughness: 0.56, metalness: 0.18 }),
    );
    frame.position.y = -0.03;
    frame.receiveShadow = true;
    boardGroup.add(frame);

    const squareGeometry = new THREE.BoxGeometry(0.985, 0.13, 0.985);
    const lightMaterial = new THREE.MeshStandardMaterial({ color: palette.light, roughness: 0.68, metalness: 0.04 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: palette.dark, roughness: 0.72, metalness: 0.05 });

    const squareMeshes = new Map();
    for (let rank = 1; rank <= 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const square = `${FILES[file]}${rank}`;
        const { x, z } = squareToWorld(square, orientation);
        const light = (file + (rank - 1)) % 2 === 1;
        const mesh = new THREE.Mesh(squareGeometry, light ? lightMaterial.clone() : darkMaterial.clone());
        mesh.position.set(x, 0.11, z);
        mesh.userData = { square, light, baseColor: light ? palette.light : palette.dark };
        mesh.receiveShadow = true;
        boardGroup.add(mesh);
        squareMeshes.set(square, mesh);
      }
    }
    squareMeshesRef.current = squareMeshes;
    lightMaterial.dispose();
    darkMaterial.dispose();

    const pieceGroup = new THREE.Group();
    pieceGroupRef.current = pieceGroup;
    scene.add(pieceGroup);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function intersectionsFor(event, objects) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return [];
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(objects, false);
    }

    function squareFromEvent(event) {
      const pieces = [...pieceObjectsRef.current.values()].map((entry) => entry.sprite);
      const pieceHit = intersectionsFor(event, pieces)[0];
      if (pieceHit?.object?.userData?.square) {
        return { square: pieceHit.object.userData.square, piece: true };
      }
      const squareHit = intersectionsFor(event, [...squareMeshes.values()])[0];
      return squareHit?.object?.userData?.square ? { square: squareHit.object.userData.square, piece: false } : null;
    }

    function onPointerUp(event) {
      const hit = squareFromEvent(event);
      if (!hit) return;
      if (hit.piece && onPieceClick) onPieceClick(hit.square, event);
      else onSquareClick?.(hit.square);
    }

    function onDoubleClick(event) {
      const hit = squareFromEvent(event);
      if (!hit) return;
      if (hit.piece && onPieceDoubleClick) onPieceDoubleClick(hit.square, event);
      else onSquareDoubleClick?.(hit.square);
    }

    function onPointerMove(event) {
      renderer.domElement.style.cursor = squareFromEvent(event) ? 'pointer' : 'default';
    }

    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('dblclick', onDoubleClick);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    function resize() {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resizeObserverRef.current = observer;

    let active = true;
    let previous = performance.now();
    function render(now) {
      if (!active) return;
      const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
      previous = now;
      for (const entry of pieceObjectsRef.current.values()) {
        if (!entry.tween) continue;
        entry.tween.elapsed += dt;
        const p = Math.min(1, entry.tween.elapsed / entry.tween.duration);
        const eased = 1 - Math.pow(1 - p, 3);
        entry.sprite.position.lerpVectors(entry.tween.from, entry.tween.to, eased);
        entry.sprite.position.y += Math.sin(Math.PI * p) * 0.006;
        if (p >= 1) entry.tween = null;
      }
      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(render);
    }
    frameRef.current = requestAnimationFrame(render);
    setReady(true);

    return () => {
      active = false;
      setReady(false);
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      disposeObject(scene);
      for (const texture of texturesRef.current.values()) texture.dispose?.();
      texturesRef.current.clear();
      pieceObjectsRef.current.clear();
      squareMeshesRef.current.clear();
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      boardGroupRef.current = null;
      pieceGroupRef.current = null;
    };
  }, [orientation, palette, onPieceClick, onPieceDoubleClick, onSquareClick, onSquareDoubleClick, onUnavailable]);

  useEffect(() => {
    for (const [square, mesh] of squareMeshesRef.current) {
      const isSelected = selectedSquare === square;
      const target = legalTargets.find((move) => move.to === square);
      const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
      const isHint = hintMove && (hintMove.from === square || hintMove.to === square);
      const isCheck = checkSquare === square;
      let color = mesh.userData.baseColor;
      let emissive = 0x000000;
      let emissiveIntensity = 0;
      if (isLast) color = 0x9a7b37;
      if (isHint) { color = 0x4b9c91; emissive = 0x1b5f59; emissiveIntensity = 0.28; }
      if (target) {
        color = target.san?.includes('x') ? 0xb35b45 : 0x6a9b55;
        emissive = target.san?.includes('x') ? 0x5e1f18 : 0x244f20;
        emissiveIntensity = 0.32;
      }
      if (isSelected) { color = palette.accent; emissive = palette.accent; emissiveIntensity = 0.28; }
      if (isCheck) { color = 0xb3212b; emissive = 0x8b0e16; emissiveIntensity = 0.58; }
      mesh.material.color.setHex(color);
      mesh.material.emissive.setHex(emissive);
      mesh.material.emissiveIntensity = emissiveIntensity;
    }
  }, [selectedSquare, legalTargets, lastMove, hintMove, checkSquare, palette]);

  useEffect(() => {
    const group = pieceGroupRef.current;
    if (!group) return;

    for (const child of [...group.children]) {
      group.remove(child);
      disposeObject(child);
    }
    pieceObjectsRef.current.clear();

    const loader = new THREE.TextureLoader();
    for (const { square, piece } of gridEntries(grid)) {
      const url = pieceImages?.[piece];
      if (!url) continue;
      let texture = texturesRef.current.get(url);
      if (!texture) {
        texture = loader.load(url, () => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
        });
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.NearestFilter;
        texturesRef.current.set(url, texture);
      }

      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.08, depthWrite: true });
      const sprite = new THREE.Sprite(material);
      const { x, z } = squareToWorld(square, orientation);
      sprite.position.set(x, 0.9, z);
      sprite.scale.set(0.9, 1.22, 1);
      sprite.userData = { square, piece, label: pieceLabels?.[square] || null };
      group.add(sprite);

      const level = Number(pieceRankLevels?.[square] ?? pieceLevels?.[square] ?? 1);
      if (level > 1) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.31, 0.42, 28),
          new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.66, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.205, z);
        group.add(ring);
      }
      if (Number(pieceXp?.[square] || 0) > 0) {
        const xp = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 12, 10),
          new THREE.MeshBasicMaterial({ color: 0x8ad4ff }),
        );
        xp.position.set(x + 0.34, 0.24, z + 0.34);
        group.add(xp);
      }

      pieceObjectsRef.current.set(square, { sprite, tween: null });
    }

    if (animate?.seq && animate.seq !== lastAnimatedSeqRef.current && animate.kind !== 'miss') {
      lastAnimatedSeqRef.current = animate.seq;
      const entry = pieceObjectsRef.current.get(animate.to);
      if (entry) {
        const from = squareToWorld(animate.from, orientation);
        const to = squareToWorld(animate.to, orientation);
        const y = entry.sprite.position.y;
        entry.sprite.position.set(from.x, y, from.z);
        entry.tween = {
          from: new THREE.Vector3(from.x, y, from.z),
          to: new THREE.Vector3(to.x, y, to.z),
          elapsed: 0,
          duration: 0.22,
        };
      }
    }
  }, [grid, pieceImages, orientation, animate, pieceLevels, pieceRankLevels, pieceXp, pieceLabels, palette]);

  return (
    <div className="board3d-shell" data-board-renderer="3d">
      <div ref={hostRef} className="board3d-host" />
      <div className="board3d-renderer-toggle" aria-label="Vista del tablero">
        <button type="button" onClick={onUse2D}>2D</button>
        <button type="button" className="is-active" aria-pressed="true">3D</button>
      </div>
      <span className="board3d-status">{ready ? 'THREE.JS · 3D' : 'INICIANDO 3D…'}</span>
    </div>
  );
}
