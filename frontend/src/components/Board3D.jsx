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
        const sprite = makeTextSprite(file.toUpperCase(), '#d4aa54');
        sprite.position.set(index - 3.5, 0.16, whiteSide ? 4.68 : -4.68);
        coordinateGroup.add(sprite);
      });
      rankOrder.forEach((rank, index) => {
        const sprite = makeTextSprite(rank, '#d4aa54');
        sprite.position.set(whiteSide ? -4.68 : 4.68, 0.16, whiteSide ? 3.5 - index : -3.5 + index);
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

    function selectSquareFromTouch(event) {
      const square = squareFromPointer(event);
      renderer.domElement.dataset.warRoomLastSquare = square || '';
      if (!square) return false;
      setFocusedSquare(square);
      latestPropsRef.current.onSquareClick?.(square);
      return true;
    }

    function onPointerDown(event) {
      const touchLike = event.pointerType === 'touch' || event.pointerType === 'pen';
      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
        pointerType: event.pointerType,
        handled: false,
      };
      if (inspectModeRef.current) {
        const motion = cameraMotionRef.current;
        motion.dragging = true;
        motion.lastX = event.clientX;
        motion.lastY = event.clientY;
        renderer.domElement.setPointerCapture?.(event.pointerId);
        return;
      }
      if (!touchLike) return;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      renderer.domElement.dataset.warRoomTouchStage = 'down';
      const handled = selectSquareFromTouch(event);
      if (pointerStartRef.current) pointerStartRef.current.handled = handled;
    }

    function onPointerMove(event) {
      const motion = cameraMotionRef.current;
      if (inspectModeRef.current) {
        renderer.domElement.style.cursor = motion.dragging ? 'grabbing' : 'grab';
        if (motion.dragging) {
          const dx = event.clientX - motion.lastX;
          const dy = event.clientY - motion.lastY;
          motion.lastX = event.clientX;
          motion.lastY = event.clientY;
          motion.yaw = THREE.MathUtils.clamp(motion.yaw - dx * 0.0023, -0.14, 0.14);
          motion.pitch = THREE.MathUtils.clamp(motion.pitch - dy * 0.0018, -0.08, 0.075);
        }
        return;
      }
      if (coarsePointer) return;
      const square = squareFromPointer(event);
      const pieceHover = square && pieceMeshes.has(square) ? square : null;
      renderer.domElement.style.cursor = pieceHover ? 'pointer' : 'default';
      setHoveredSquare((current) => current === pieceHover ? current : pieceHover);
    }

    function onPointerLeave() {
      const motion = cameraMotionRef.current;
      motion.targetX = 0;
      motion.targetY = 0;
      motion.dragging = false;
      renderer.domElement.style.cursor = 'default';
      setHoveredSquare(null);
    }

    function releasePointer(event) {
      try {
        if (renderer.domElement.hasPointerCapture?.(event.pointerId)) {
          renderer.domElement.releasePointerCapture?.(event.pointerId);
        }
      } catch {
        // Android/WebView can already have released capture on cancellation.
      }
    }

    function onPointerCancel(event) {
      pointerStartRef.current = null;
      cameraMotionRef.current.dragging = false;
      renderer.domElement.dataset.warRoomTouchStage = 'cancel';
      releasePointer(event);
    }

    function onPointerUp(event) {
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (inspectModeRef.current) {
        cameraMotionRef.current.dragging = false;
        renderer.domElement.style.cursor = 'grab';
        releasePointer(event);
        return;
      }
      if (start?.handled) {
        renderer.domElement.dataset.warRoomTouchStage = 'up';
        releasePointer(event);
        return;
      }
      const touchLike = coarsePointer || start?.pointerType === 'touch' || start?.pointerType === 'pen';
      const tap = resolveBoardTap(
        start,
        { x: event.clientX, y: event.clientY, id: event.pointerId },
        { coarsePointer: touchLike },
      );
      if (!tap) {
        releasePointer(event);
        return;
      }
      const square = squareFromPointer({ clientX: tap.x, clientY: tap.y });
      renderer.domElement.dataset.warRoomLastSquare = square || '';
      if (!square) {
        releasePointer(event);
        return;
      }
      setFocusedSquare(square);
      latestPropsRef.current.onSquareClick?.(square);
      releasePointer(event);
    }

    function onContextLost(event) {
      event.preventDefault();
      latestPropsRef.current.onRendererFailure?.(new Error('WebGL context lost'));
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown, { passive: true });
    renderer.domElement.addEventListener('pointermove', onPointerMove, { passive: true });
    renderer.domElement.addEventListener('pointerleave', onPointerLeave, { passive: true });
    renderer.domElement.addEventListener('pointerup', onPointerUp, { passive: true });
    renderer.domElement.addEventListener('pointercancel', onPointerCancel, { passive: true });
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);

    let lastAmbientPaint = 0;
    function ambientFrame(now) {
      const motion = cameraMotionRef.current;
      const plan = warRoomAmbientFramePlan({
        documentHidden: document.hidden,
        reducedMotion: getEffectiveReducedMotion(),
        coarsePointer,
        softwareRenderer,
        inspectMode: inspectModeRef.current,
        elapsedMs: now - lastAmbientPaint,
      });
      if (plan.shouldRender) {
        if (plan.updateCamera) {
          const basePosition = camera.userData.basePosition;
          const baseTarget = camera.userData.baseTarget;
          if (basePosition && baseTarget) {
            const offset = basePosition.clone().sub(baseTarget).applyEuler(new THREE.Euler(motion.pitch, motion.yaw, 0, 'YXZ'));
            camera.position.copy(baseTarget).add(offset);
            camera.lookAt(baseTarget);
          }
        }
        // The castle fire updates from onBeforeRender, so desktop needs a
        // quiet scene heartbeat even when the player does not move the mouse.
        render();
        // Start the idle budget after WebGL finishes. Software renderers can
        // otherwise consume the whole interval and starve pointer handling.
        lastAmbientPaint = performance.now();
      }
      ambientFrameRef.current = window.requestAnimationFrame(ambientFrame);
    }
    if (!coarsePointer) ambientFrameRef.current = window.requestAnimationFrame(ambientFrame);

    sceneStateRef.current = {
      scene,
      camera,
      renderer,
      pieceGroup,
      pieceMeshes,
      highlightMeshes,
      coarsePointer,
      renderLite,
      key,
      rim,
      warm,
      render,
      renderScale: Math.min(window.devicePixelRatio || 1, sceneProfile.pixelRatioCap),
      slowFrameCount: 0,
    };
    setRendererLabel(renderer.capabilities.isWebGL2 ? '3D · WEBGL2' : '3D · WEBGL');
    render();

    return () => {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      window.cancelAnimationFrame(ambientFrameRef.current);
      ambientFrameRef.current = 0;
      observer?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((object) => {
        if (object.userData?.ownedTexture) object.userData.ownedTexture.dispose();
      });
      releaseEnvironment();
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      sceneStateRef.current = null;
    };
  }, [boardTheme, orientation, showCoordinates]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return undefined;
    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = 0;

    const previousPieces = parseFen(previousFenRef.current);
    const nextPieces = parseFen(fen);
    const movingBefore = animate?.from ? previousPieces.find((piece) => piece.square === animate.from) : null;
    const movingAfter = animate?.to ? nextPieces.find((piece) => piece.square === animate.to) : null;
    const capturedPiece = inferCapturedPiece(previousPieces, nextPieces, animate);
    const promotion = Boolean(movingBefore?.type === 'p' && movingAfter && movingAfter.type !== 'p');
    const fromFile = FILES.indexOf(animate?.from?.[0]);
    const toFile = FILES.indexOf(animate?.to?.[0]);
    const castling = Boolean(movingBefore?.type === 'k' && fromFile >= 0 && toFile >= 0 && Math.abs(toFile - fromFile) === 2);

    for (const child of [...state.pieceGroup.children]) {
      state.pieceGroup.remove(child);
      disposeObject(child);
    }
    state.pieceMeshes.clear();

    for (const piece of nextPieces) {
      const matthiasKing = isMatthiasRivalKing(piece, matthiasKingColor);
      const mesh = buildPiece(piece.type, piece.color, skinId, state.renderLite, {
        matthiasKing,
        faceTowardCamera: orientation !== 'black',
      });
      const { x, z } = squarePosition(piece.square);
      mesh.position.set(x, 0.1, z);
      mesh.userData.square = piece.square;
      mesh.userData.type = piece.type;
      mesh.userData.color = piece.color;
      mesh.userData.baseY = 0.1;
      mesh.userData.baseScale = mesh.scale.clone();
      if (matthiasKing) mesh.userData.matthiasKing = true;
      mesh.traverse((object) => { object.userData.square = piece.square; });
      addCoarsePieceHitTarget(mesh, piece.square, state.coarsePointer);
      state.pieceGroup.add(mesh);
      state.pieceMeshes.set(piece.square, mesh);
    }

    previousFenRef.current = fen;
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
      applyMatthiasCheckPose(state, checkSquare, orientation);
      state.render();
      return undefined;
    }

    lastAnimatedSeqRef.current = animate.seq;
    const from = squarePosition(animate.from);
    const to = squarePosition(animate.to);
    const kinetics = deriveMoveKinetics({
      movingType: movingBefore?.type || movingAfter?.type,
      capture: Boolean(animate.capture),
      promotion,
      castling,
      coarsePointer: state.coarsePointer,
    });
    const start = performance.now();
    const baseScale = animatedMesh.scale.clone();
    let capturedGhost = null;
    let castleRook = null;
    let castleFrom = null;
    let castleTo = null;

    if (capturedPiece) {
      capturedGhost = buildPiece(capturedPiece.type, capturedPiece.color, skinId, state.renderLite, {
        matthiasKing: isMatthiasRivalKing(capturedPiece, matthiasKingColor),
        faceTowardCamera: orientation !== 'black',
      });
      const capturedPosition = squarePosition(capturedPiece.square);
      capturedGhost.position.set(capturedPosition.x, 0.1, capturedPosition.z);
      capturedGhost.userData.captureGhost = true;
      state.pieceGroup.add(capturedGhost);
    }

    if (castling) {
      const rank = animate.to[1];
      const kingSide = toFile > fromFile;
      const rookFromSquare = `${kingSide ? 'h' : 'a'}${rank}`;
      const rookToSquare = `${kingSide ? 'f' : 'd'}${rank}`;
      castleRook = state.pieceMeshes.get(rookToSquare) || null;
      castleFrom = squarePosition(rookFromSquare);
      castleTo = squarePosition(rookToSquare);
      if (castleRook) castleRook.position.set(castleFrom.x, 0.1, castleFrom.z);
    }

    function setOpacity(group, opacity) {
      group?.traverse?.((object) => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (!material) return;
          material.transparent = opacity < 0.999;
          material.opacity = opacity;
          if (opacity < 0.999) material.depthWrite = false;
        });
      });
    }

    function frame(now) {
      const raw = Math.min(1, Math.max(0, (now - start) / kinetics.duration));
      const progress = animate.kind === 'miss'
        ? (raw < 0.5 ? raw * 0.72 : (1 - raw) * 0.72)
        : easeOutCubic(raw);
      animatedMesh.position.x = to.x + (from.x - to.x) * (1 - progress);
      animatedMesh.position.z = to.z + (from.z - to.z) * (1 - progress);
      animatedMesh.position.y = 0.1 + Math.sin(raw * Math.PI) * (animate.kind === 'miss' ? 0.08 : kinetics.lift);

      if (animate.capture && capturedGhost) {
        const impact = smoothstep(kinetics.impactStart, 0.9, raw);
        const side = orientation === 'black' ? -1 : 1;
        capturedGhost.rotation.z = side * kinetics.captureTilt * impact;
        capturedGhost.rotation.x = impact * 0.16;
        capturedGhost.position.y = 0.1 - impact * 0.075;
        capturedGhost.scale.multiplyScalar(1 - impact * 0.0016);
        setOpacity(capturedGhost, 1 - impact * 0.92);
        animatedMesh.rotation.z = Math.sin(impact * Math.PI) * 0.045 * side;
      }

      if (promotion && raw > 0.62) {
        const pulseT = (raw - 0.62) / 0.38;
        const pulse = Math.sin(Math.min(1, pulseT) * Math.PI) * kinetics.promotionPulse;
        animatedMesh.scale.copy(baseScale).multiplyScalar(1 + pulse);
        state.rim.intensity = 14.5 + pulse * 56;
      }

      if (castleRook && castleFrom && castleTo) {
        const rookRaw = clamp01((raw - kinetics.rookDelay) / Math.max(0.01, 1 - kinetics.rookDelay));
        const rookProgress = easeOutCubic(rookRaw);
        castleRook.position.x = castleTo.x + (castleFrom.x - castleTo.x) * (1 - rookProgress);
        castleRook.position.z = castleTo.z + (castleFrom.z - castleTo.z) * (1 - rookProgress);
        castleRook.position.y = 0.1 + Math.sin(rookRaw * Math.PI) * 0.075;
      }

      const dt = state.lastAnimationFrameAt ? now - state.lastAnimationFrameAt : 16;
      state.lastAnimationFrameAt = now;
      state.slowFrameCount = dt > 23 ? state.slowFrameCount + 1 : Math.max(0, state.slowFrameCount - 1);
      const requestedScale = adaptiveRenderScale({ coarsePointer: state.coarsePointer, slowFrameCount: state.slowFrameCount });
      const cappedScale = Math.min(window.devicePixelRatio || 1, requestedScale);
      if (cappedScale + 0.05 < state.renderScale) {
        state.renderScale = cappedScale;
        state.renderer.setPixelRatio(cappedScale);
        const host = hostRef.current;
        if (host) state.renderer.setSize(Math.max(280, host.clientWidth || 280), Math.max(300, host.clientHeight || 300), false);
      }

      state.render();
      if (raw < 1) animationFrameRef.current = window.requestAnimationFrame(frame);
      else {
        animatedMesh.position.set(to.x, 0.1, to.z);
        animatedMesh.rotation.z = 0;
        animatedMesh.scale.copy(baseScale);
        if (castleRook && castleTo) castleRook.position.set(castleTo.x, 0.1, castleTo.z);
        if (capturedGhost) {
          state.pieceGroup.remove(capturedGhost);
          disposeObject(capturedGhost);
          capturedGhost = null;
        }
        const lights = reactiveLightProfile({ check: Boolean(checkSquare), gameOver, coarsePointer: state.coarsePointer });
        state.key.intensity = lights.key;
        state.rim.intensity = lights.rim;
        state.warm.intensity = lights.warm;
        state.renderer.toneMappingExposure = lights.exposure;
        applyMatthiasCheckPose(state, checkSquare, orientation);
        state.render();
        animationFrameRef.current = 0;
        state.lastAnimationFrameAt = 0;
      }
    }

    animatedMesh.position.set(from.x, 0.1, from.z);
    state.render();
    animationFrameRef.current = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      if (capturedGhost) {
        state.pieceGroup.remove(capturedGhost);
        disposeObject(capturedGhost);
      }
    };
  }, [fen, skinId, animate, boardTheme, orientation, showCoordinates, matthiasKingColor, checkSquare, gameOver]);

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
      marker.scale.setScalar(1);
      const style = board3DHighlightStyle({
        square,
        focusedSquare,
        hoveredSquare,
        lastMove,
        hintMove,
        legalMap,
        selectedSquare,
        checkSquare,
      });
      if (style) {
        marker.material.color.setHex(style.color);
        marker.material.opacity = style.opacity;
        marker.scale.setScalar(style.scale);
        marker.visible = true;
      }
    }
    applyMatthiasCheckPose(state, checkSquare, orientation);
    state.render();
  }, [selectedSquare, legalMap, lastMove, hintMove, checkSquare, focusedSquare, hoveredSquare, boardTheme, orientation, showCoordinates]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    const lights = reactiveLightProfile({ check: Boolean(checkSquare), gameOver, coarsePointer: state.coarsePointer });
    state.key.intensity = lights.key;
    state.rim.intensity = lights.rim;
    state.warm.intensity = lights.warm;
    state.renderer.toneMappingExposure = lights.exposure;
    if (state.scene.fog?.isFogExp2) state.scene.fog.density = lights.fogDensity;
    applyMatthiasCheckPose(state, checkSquare, orientation);
    state.render();
  }, [checkSquare, gameOver, boardTheme, orientation, showCoordinates]);

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
    <div
      className="board3d-main-shell"
      data-board3d-war-room="true"
      data-board3d-scene="premium"
      data-board3d-surface="premium-v2"
      data-board3d-motion="physical-v1"
      data-board3d-camera="fixed-tactical"
      data-board3d-inspect={inspectMode ? 'true' : 'false'}
      data-board3d-selected={selectedSquare || ''}
      data-board3d-focused={focusedSquare || ''}
      data-board3d-legal-target-count={legalMap.size}
      data-matthias-rival-king={matthiasKingColor || 'off'}
    >
      <div ref={hostRef} className="board3d-main-host" onKeyDown={handleKeyDown} />
      <div className="board3d-fixed-camera-note" aria-hidden="true">SALA DE GUERRA · {inspectMode ? 'INSPECCIÓN' : 'CÁMARA TÁCTICA'}</div>
      <div className="board3d-renderer-badge" aria-hidden="true">{rendererLabel}</div>
      <button type="button" className="board3d-inspect secondary-btn" aria-pressed={inspectMode} onClick={() => setInspectMode((value) => !value)}>{inspectMode ? 'Volver a jugar' : 'Inspeccionar'}</button>
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
