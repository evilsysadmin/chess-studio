import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Board from './Board.jsx';
import { buildPremiumTableLayer, buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import { isMatthiasRivalKing } from './MatthiasKing3D.js';
import { installPremiumEnvironment, makePremiumTileMaterial } from './Board3DSurfaces.js';
import { loadBoardTheme } from '../career.js';
import { loadSelectedSkin } from '../tournamentRewards.js';
import { USER_PREFERENCES_CHANGED_EVENT, getEffectiveReducedMotion } from '../userPreferences.js';
import { adaptiveRenderScale, clamp01, deriveMoveKinetics, easeOutCubic, inferCapturedPiece, reactiveLightProfile, smoothstep } from './WarRoom3DMotion.js';
import { isSoftwareWebGLRenderer, warRoomAmbientFramePlan, warRoomSceneProfile } from './WarRoom3DAnimation.js';
import { resolveBoardTap } from './WarRoom3DTouch.js';
import { BOARD3D_HIGHLIGHT_SIZE, BOARD3D_HIGHLIGHT_Y, board3DHighlightStyle } from './Board3DHighlights.js';
import { BOARD_THEME_3D, FILES } from './Board3DConfig.js';
import { adjacentSquare, parseFen, squarePosition } from './Board3DBoardMath.js';
import { addCoarsePieceHitTarget, applyMatthiasCheckPose, buildPiece, disposeObject } from './Board3DPieces.js';
import { addMesh, buildWarRoom, fitBoardCamera, makeTextSprite } from './Board3DScene.js';
import './Board3D.css';
import './Board3DViewportTuning.css';
import './WarRoomDesktopRailLayout.css';

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
  gameOver = false,
  showCoordinates = true,
  matthiasKingColor = null,
  onCustomize,
  onRendererFailure,
}) {
  const hostRef = useRef(null);
  const sceneStateRef = useRef(null);
  const pointerStartRef = useRef(null);
  const latestPropsRef = useRef({});
  const animationFrameRef = useRef(0);
  const ambientFrameRef = useRef(0);
  const previousFenRef = useRef(fen);
  const lastAnimatedSeqRef = useRef(0);
  const inspectModeRef = useRef(false);
  const cameraMotionRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, yaw: 0, pitch: 0, dragging: false, lastX: 0, lastY: 0 });
  const [skinId, setSkinId] = useState(() => loadSelectedSkin());
  const [boardTheme, setBoardTheme] = useState(() => loadBoardTheme());
  const [rendererLabel, setRendererLabel] = useState('3D');
  const [focusedSquare, setFocusedSquare] = useState(() => orientation === 'black' ? 'e8' : 'e1');
  const [hoveredSquare, setHoveredSquare] = useState(null);
  const [inspectMode, setInspectMode] = useState(false);

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
    setHoveredSquare(null);
  }, [orientation]);

  useEffect(() => {
    inspectModeRef.current = inspectMode;
    if (!inspectMode) {
      const motion = cameraMotionRef.current;
      motion.x = 0;
      motion.y = 0;
      motion.targetX = 0;
      motion.targetY = 0;
      motion.yaw = 0;
      motion.pitch = 0;
      motion.dragging = false;
      const state = sceneStateRef.current;
      const basePosition = state?.camera?.userData?.basePosition;
      const baseTarget = state?.camera?.userData?.baseTarget;
      if (state && basePosition && baseTarget) {
        state.camera.position.copy(basePosition);
        state.camera.lookAt(baseTarget);
        state.render();
      }
    }
  }, [inspectMode]);

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

    let softwareRenderer = false;
    try {
      const gl = renderer.getContext();
      const debugRendererInfo = gl.getExtension?.('WEBGL_debug_renderer_info');
      const rendererName = debugRendererInfo
        ? gl.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      softwareRenderer = isSoftwareWebGLRenderer(rendererName);
    } catch {
      // Renderer introspection is optional. Unknown renderers keep the normal
      // heartbeat and can still rely on reduced-motion/coarse-pointer gates.
    }

    const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    const sceneProfile = warRoomSceneProfile({ coarsePointer, softwareRenderer });
    const renderLite = sceneProfile.lite;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const squareMeshes = new Map();
    const highlightMeshes = new Map();
    const pieceMeshes = new Map();
    const pieceGroup = new THREE.Group();
    const coordinateGroup = new THREE.Group();
    const boardGroup = new THREE.Group();
    const theme = BOARD_THEME_3D[boardTheme] || BOARD_THEME_3D.classic;
    const whiteSide = orientation !== 'black';

    scene.background = new THREE.Color(0x080a0f);
    scene.fog = new THREE.FogExp2(0x080a0f, 0.018);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, sceneProfile.pixelRatioCap));
    renderer.shadowMap.enabled = sceneProfile.shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = renderLite ? 1.02 : 1.05;
    renderer.domElement.className = 'board3d-main-canvas';
    renderer.domElement.setAttribute('aria-label', 'Tablero de ajedrez 3D en Sala de guerra. Cámara táctica fija desde tu lado. Usa flechas y Enter para jugar con teclado.');
    renderer.domElement.setAttribute('role', 'application');
    renderer.domElement.tabIndex = 0;
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    const releaseEnvironment = installPremiumEnvironment(renderer, scene, { coarsePointer: renderLite });

    scene.add(new THREE.HemisphereLight(0xffefd0, 0x10192b, 1.35));
    const key = new THREE.DirectionalLight(0xffe1aa, 2.35);
    key.position.set(-5.4, 10, whiteSide ? 6.6 : -6.6);
    key.castShadow = sceneProfile.shadowsEnabled;
    key.shadow.mapSize.set(sceneProfile.shadowMapSize, sceneProfile.shadowMapSize);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 28;
    key.shadow.bias = -0.00045;
    key.shadow.normalBias = 0.018;
    key.shadow.radius = renderLite ? 1.1 : 2.35;
    scene.add(key);
    const rim = new THREE.PointLight(theme.glow, 14.5, 19, 2);
    rim.position.set(4.8, 3.6, whiteSide ? -4.8 : 4.8);
    scene.add(rim);
    const warm = new THREE.PointLight(0xffa449, 5.8, 16, 2);
    warm.position.set(-4.6, 4.4, whiteSide ? -5.8 : 5.8);
    scene.add(warm);

    const warRoom = buildWarRoom(theme, whiteSide, renderLite);
    scene.add(warRoom);
    scene.add(buildPremiumWarRoomLayer(theme, whiteSide, renderLite));

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(11.6, 0.55, 11.6),
      new THREE.MeshPhysicalMaterial({ color: 0x1f120c, metalness: 0.08, roughness: 0.6, clearcoat: 0.28, clearcoatRoughness: 0.25, envMapIntensity: 0.74 }),
    );
    table.position.y = -0.48;
    table.receiveShadow = true;
    scene.add(table);
    scene.add(buildPremiumTableLayer(theme, renderLite));

    const pedestal = new THREE.Mesh(
      new THREE.BoxGeometry(9.35, 0.4, 9.35),
      new THREE.MeshPhysicalMaterial({ color: theme.frame, metalness: 0.08, roughness: 0.67, clearcoat: 0.18, clearcoatRoughness: 0.36, envMapIntensity: 0.48, specularIntensity: 0.42 }),
    );
    pedestal.position.y = -0.22;
    pedestal.receiveShadow = true;
    boardGroup.add(pedestal);

    const frameGold = new THREE.MeshPhysicalMaterial({ color: 0xa77a2d, metalness: 0.72, roughness: 0.24, clearcoat: 0.68, clearcoatRoughness: 0.12, envMapIntensity: 1.2 });
    const frameWood = new THREE.MeshPhysicalMaterial({ color: theme.frame, metalness: 0.025, roughness: 0.7, clearcoat: 0.15, clearcoatRoughness: 0.4, envMapIntensity: 0.42, specularIntensity: 0.36 });
    for (const [x, z, sx, sz] of [
      [0, 4.38, 9.05, 0.28], [0, -4.38, 9.05, 0.28],
      [4.38, 0, 0.28, 9.05], [-4.38, 0, 0.28, 9.05],
    ]) {
      addMesh(boardGroup, new THREE.BoxGeometry(sx, 0.18, sz), frameWood, [x, 0.03, z]);
    }
    for (const [x, z, sx, sz] of [
      [0, 4.16, 8.55, 0.055], [0, -4.16, 8.55, 0.055],
      [4.16, 0, 0.055, 8.55], [-4.16, 0, 0.055, 8.55],
    ]) {
      addMesh(boardGroup, new THREE.BoxGeometry(sx, 0.08, sz), frameGold, [x, 0.135, z]);
    }

    const lightTileMaterial = makePremiumTileMaterial({ color: theme.light, light: true, coarsePointer: renderLite, seed: 0x531f });
    const darkTileMaterial = makePremiumTileMaterial({ color: theme.dark, light: false, coarsePointer: renderLite, seed: 0xa72d });

    for (let rank = 1; rank <= 8; rank += 1) {
      for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
        const square = `${FILES[fileIndex]}${rank}`;
        const { x, z } = squarePosition(square);
        const light = (rank + fileIndex) % 2 === 1;
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(0.984, 0.105, 0.984),
          light ? lightTileMaterial : darkTileMaterial,
        );
        const tileSettling = ((fileIndex * 13 + rank * 7) % 5 - 2) * 0.0008;
        tile.position.set(x, 0.0525 + tileSettling, z);
        tile.receiveShadow = true;
        tile.userData.square = square;
        boardGroup.add(tile);
        squareMeshes.set(square, tile);

        const marker = new THREE.Mesh(
          new THREE.PlaneGeometry(BOARD3D_HIGHLIGHT_SIZE, BOARD3D_HIGHLIGHT_SIZE),
          new THREE.MeshBasicMaterial({
            color: 0x145f8a,
            transparent: true,
            opacity: 0.86,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            toneMapped: false,
          }),
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(x, BOARD3D_HIGHLIGHT_Y, z);
        marker.visible = false;
        marker.renderOrder = 6;
        boardGroup.add(marker);
        highlightMeshes.set(square, marker);
      }
    }

    boardGroup.add(pieceGroup);
    boardGroup.add(coordinateGroup);
    scene.add(boardGroup);

    if (showCoordinates) {
      const fileOrder = whiteSide ? FILES : [...FILES].reverse();
      const rankOrder = whiteSide ? ['1','2','3','4','5','6','7','8'] : ['8','7','6','5','4','3','2','1'];
      fileOrder.forEach((file, index) => {
        const { x } = squarePosition(`${FILES[index]}1`);
        const label = makeTextSprite(file, '#dfcfaa', 0.42);
        label.position.set(x, 0.2, whiteSide ? 4.72 : -4.72);
        coordinateGroup.add(label);
      });
      rankOrder.forEach((rank, index) => {
        const { z } = squarePosition(`a${index + 1}`);
        const label = makeTextSprite(rank, '#dfcfaa', 0.42);
        label.position.set(whiteSide ? -4.72 : 4.72, 0.2, z);
        coordinateGroup.add(label);
      });
    }

    fitBoardCamera(camera, host, orientation);
    camera.userData.basePosition = camera.position.clone();
    camera.userData.baseTarget = new THREE.Vector3(0, 0.35, 0);

    const render = () => renderer.render(scene, camera);
    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      renderer.setSize(host.clientWidth, host.clientHeight, false);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      fitBoardCamera(camera, host, orientation);
      camera.userData.basePosition = camera.position.clone();
      camera.userData.baseTarget = new THREE.Vector3(0, 0.35, 0);
      render();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const state = {
      scene,
      camera,
      renderer,
      render,
      resize,
      releaseEnvironment,
      raycaster,
      pointer,
      squareMeshes,
      highlightMeshes,
      pieceMeshes,
      pieceGroup,
      coordinateGroup,
      boardGroup,
      renderLite,
      coarsePointer,
      softwareRenderer,
      theme,
      whiteSide,
      disposed: false,
    };
    sceneStateRef.current = state;

    return () => {
      state.disposed = true;
      resizeObserver.disconnect();
      releaseEnvironment?.();
      renderer.dispose();
      renderer.forceContextLoss?.();
      host.removeChild(renderer.domElement);
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((mat) => mat?.dispose?.());
      });
      sceneStateRef.current = null;
    };
  }, [boardTheme, orientation]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    const nextPieces = parseFen(fen);
    const previousPieces = parseFen(previousFenRef.current || fen);
    const moved = deriveMoveKinetics(previousPieces, nextPieces, animate, orientation);

    for (const child of [...state.pieceGroup.children]) {
      state.pieceGroup.remove(child);
      disposeObject(child);
    }
    state.pieceMeshes.clear();

    for (const piece of nextPieces) {
      const mesh = buildPiece(piece, skinId, state.renderLite);
      const { x, z } = squarePosition(piece.square);
      mesh.position.set(x, 0.17, z);
      mesh.userData.square = piece.square;
      mesh.userData.piece = piece;
      if (state.renderLite) addCoarsePieceHitTarget(mesh, piece.square);
      if (isMatthiasRivalKing(piece, matthiasKingColor)) {
        mesh.userData.matthiasKing = true;
        applyMatthiasCheckPose(mesh, checkSquare === piece.square, gameOver);
      }
      state.pieceGroup.add(mesh);
      state.pieceMeshes.set(piece.square, mesh);
    }

    previousFenRef.current = fen;
    if (moved && animate?.seq && animate.seq !== lastAnimatedSeqRef.current) {
      lastAnimatedSeqRef.current = animate.seq;
    }
    state.render();
  }, [fen, skinId, orientation, animate?.seq, checkSquare, gameOver, matthiasKingColor]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    const style = board3DHighlightStyle({ selectedSquare, legalTargets, lastMove, hintMove, checkSquare });
    for (const [square, marker] of state.highlightMeshes.entries()) {
      const next = style.get(square);
      marker.visible = Boolean(next);
      if (!next) continue;
      marker.material.color.set(next.color);
      marker.material.opacity = next.opacity;
      marker.scale.setScalar(next.scale ?? 1);
      marker.renderOrder = next.renderOrder ?? 6;
    }
    state.render();
  }, [selectedSquare, legalTargets, lastMove, hintMove, checkSquare]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return undefined;
    const reducedMotion = getEffectiveReducedMotion();
    const plan = warRoomAmbientFramePlan({
      visible: typeof document === 'undefined' ? true : document.visibilityState === 'visible',
      reducedMotion,
      coarsePointer: state.coarsePointer,
      softwareRenderer: state.softwareRenderer,
    });
    if (!plan.enabled) return undefined;

    let cancelled = false;
    let last = 0;
    const tick = (time) => {
      if (cancelled || state.disposed) return;
      if (time - last >= plan.frameIntervalMs) {
        last = time;
        state.render();
      }
      ambientFrameRef.current = window.requestAnimationFrame(tick);
    };
    ambientFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (ambientFrameRef.current) window.cancelAnimationFrame(ambientFrameRef.current);
      ambientFrameRef.current = 0;
    };
  }, [boardTheme, orientation]);

  const eventSquare = useCallback((event) => {
    const state = sceneStateRef.current;
    const canvas = state?.renderer?.domElement;
    if (!state || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX ?? event.touches?.[0]?.clientX;
    const y = event.clientY ?? event.touches?.[0]?.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !rect.width || !rect.height) return null;
    state.pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
    state.pointer.y = -((y - rect.top) / rect.height) * 2 + 1;
    state.raycaster.setFromCamera(state.pointer, state.camera);
    return resolveBoardTap(state.raycaster, state.pieceGroup, state.squareMeshes);
  }, []);

  useEffect(() => {
    const state = sceneStateRef.current;
    const canvas = state?.renderer?.domElement;
    if (!state || !canvas) return undefined;

    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      pointerStartRef.current = { x: event.clientX, y: event.clientY, at: performance.now() };
      if (inspectModeRef.current) {
        const motion = cameraMotionRef.current;
        motion.dragging = true;
        motion.lastX = event.clientX;
        motion.lastY = event.clientY;
        canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      }
    };

    const onPointerMove = (event) => {
      if (inspectModeRef.current && cameraMotionRef.current.dragging) {
        const motion = cameraMotionRef.current;
        const dx = event.clientX - motion.lastX;
        const dy = event.clientY - motion.lastY;
        motion.lastX = event.clientX;
        motion.lastY = event.clientY;
        motion.targetX = THREE.MathUtils.clamp(motion.targetX + dx * 0.004, -0.65, 0.65);
        motion.targetY = THREE.MathUtils.clamp(motion.targetY + dy * 0.0035, -0.34, 0.34);
        motion.x = motion.targetX;
        motion.y = motion.targetY;
        const basePosition = state.camera.userData.basePosition;
        const baseTarget = state.camera.userData.baseTarget;
        if (basePosition && baseTarget) {
          const offset = basePosition.clone().sub(baseTarget);
          const spherical = new THREE.Spherical().setFromVector3(offset);
          spherical.theta -= motion.x;
          spherical.phi = THREE.MathUtils.clamp(spherical.phi + motion.y, 0.45, 1.28);
          state.camera.position.copy(baseTarget.clone().add(new THREE.Vector3().setFromSpherical(spherical)));
          state.camera.lookAt(baseTarget);
          state.render();
        }
        event.preventDefault();
        return;
      }
      if (event.pointerType === 'touch') return;
      const square = eventSquare(event);
      if (square !== hoveredSquare) setHoveredSquare(square);
    };

    const onPointerUp = (event) => {
      if (inspectModeRef.current) {
        cameraMotionRef.current.dragging = false;
        canvas.releasePointerCapture?.(event.pointerId);
        return;
      }
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      const duration = start ? performance.now() - start.at : 0;
      const distance = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) : 0;
      if (distance > 12 || duration > 650) return;
      const square = eventSquare(event);
      if (square) latestPropsRef.current.onSquareClick?.(square);
    };

    const onPointerCancel = () => {
      pointerStartRef.current = null;
      cameraMotionRef.current.dragging = false;
    };

    const onPointerLeave = () => {
      if (!cameraMotionRef.current.dragging) setHoveredSquare(null);
    };

    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp, { passive: false });
    canvas.addEventListener('pointercancel', onPointerCancel, { passive: false });
    canvas.addEventListener('pointerleave', onPointerLeave, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [eventSquare, hoveredSquare]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return undefined;
    if (!selectedSquare) return undefined;
    const piece = state.pieceMeshes.get(selectedSquare);
    if (!piece) return undefined;
    const start = performance.now();
    const duration = 480;
    const baseY = 0.17;
    let frame = 0;
    const animateSelection = (now) => {
      const t = clamp01((now - start) / duration);
      const lift = Math.sin(t * Math.PI) * 0.11;
      piece.position.y = baseY + lift;
      state.render();
      if (t < 1) frame = window.requestAnimationFrame(animateSelection);
      else piece.position.y = baseY;
    };
    frame = window.requestAnimationFrame(animateSelection);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (piece) piece.position.y = baseY;
    };
  }, [selectedSquare]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state || !animate?.seq || animate.seq === lastAnimatedSeqRef.current) return undefined;
    lastAnimatedSeqRef.current = animate.seq;
    const piece = state.pieceMeshes.get(animate.to);
    if (!piece) return undefined;
    const start = performance.now();
    const duration = 420;
    const origin = piece.position.clone();
    const captured = inferCapturedPiece(parseFen(previousFenRef.current || fen), parseFen(fen), animate);
    const kinetics = deriveMoveKinetics([], [], animate, orientation);
    let frame = 0;
    const tick = (now) => {
      const t = clamp01((now - start) / duration);
      const eased = easeOutCubic(t);
      const lift = Math.sin(t * Math.PI) * (kinetics?.lift ?? 0.14);
      piece.position.y = origin.y + lift;
      piece.rotation.y = (kinetics?.spin ?? 0) * eased;
      if (captured) {
        const rim = state.scene.children.find((child) => child.isPointLight && child.color?.getHex?.() === state.theme.glow);
        if (rim) rim.intensity = reactiveLightProfile(t, 14.5, 1.2);
      }
      state.render();
      if (t < 1) frame = window.requestAnimationFrame(tick);
      else {
        piece.position.y = origin.y;
        piece.rotation.y = 0;
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      piece.position.y = origin.y;
      piece.rotation.y = 0;
    };
  }, [animate?.seq, fen, orientation]);

  const legalSummary = useMemo(() => legalTargets.length ? `${legalTargets.length} destino${legalTargets.length === 1 ? '' : 's'} legal${legalTargets.length === 1 ? '' : 'es'}` : 'sin destinos legales', [legalTargets.length]);

  return (
    <div className="board3d-main-shell" data-renderer={rendererLabel}>
      <div className="board3d-main-host" ref={hostRef} />
      <span className="board3d-fixed-camera-note" aria-hidden="true">Sala de guerra · cámara táctica</span>
      <span className="board3d-renderer-badge" aria-live="polite">{rendererLabel}</span>
      {onCustomize && <button type="button" className="secondary-btn board3d-customize" onClick={onCustomize}>Apariencia</button>}
      <div className="sr-only" aria-live="polite">{selectedSquare ? `${selectedSquare} seleccionado, ${legalSummary}` : hoveredSquare ? `${hoveredSquare}` : ''}</div>
    </div>
  );
}

export default function Board3D(props) {
  const [failed, setFailed] = useState(false);
  const onRendererFailure = useCallback(() => setFailed(true), []);

  if (failed) {
    return (
      <div className="board3d-fallback">
        <div className="board3d-fallback-note">Tu navegador no ha podido iniciar WebGL. Seguimos con el tablero 2D.</div>
        <Board {...props} />
      </div>
    );
  }

  return <Board3DCanvas {...props} onRendererFailure={onRendererFailure} />;
}
