import React, { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import * as THREE from 'three';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { api } from '../api.js';
import { difficultyLabel } from '../difficulty.js';

const COLOR_LIGHT_SQUARE = 0xede6d6;
const COLOR_DARK_SQUARE = 0x5b4032;
const COLOR_WHITE_PIECE = 0xf2ead9;
const COLOR_BLACK_PIECE = 0x2a1f1a;
const COLOR_BOARD_BASE = 0x402c22;
const COLOR_SELECTED = 0xc9a227; // --brass
const COLOR_LEGAL_MOVE = 0x5fa8d3; // --hint
const COLOR_LEGAL_CAPTURE = 0xb4483a; // --danger
const COLOR_LAST_MOVE = 0xc9a227;

const HUMAN_COLOR = 'w'; // sin elegir color ni girar el tablero, a propósito — ver nota en el README

function squareToPosition(file, rank) {
  const fileIndex = file.charCodeAt(0) - 'a'.charCodeAt(0);
  const x = fileIndex - 3.5;
  const z = (9 - rank) - 4.5; // rank 1 al frente (cerca de la cámara, del lado del humano)
  return [x, 0, z];
}

// Igual que en el visor original: geometría simple (cono/cilindro/esfera),
// verificada por conteo y forma, no por haberla visto renderizada.
function buildPieceMesh(type, material) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 16), material);
  base.position.y = 0.06;
  group.add(base);

  if (type === 'p') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.32, 16), material);
    body.position.y = 0.28;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), material);
    head.position.y = 0.52;
    group.add(body, head);
  } else if (type === 'n') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.4, 16), material);
    body.position.y = 0.32;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.34), material);
    head.position.set(0, 0.58, 0.08);
    head.rotation.x = -0.35;
    group.add(body, head);
  } else if (type === 'b') {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 16), material);
    body.position.y = 0.4;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), material);
    top.position.y = 0.72;
    group.add(body, top);
  } else if (type === 'r') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.45, 16), material);
    body.position.y = 0.34;
    group.add(body);
    for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.09), material);
      tooth.position.set(Math.cos(angle) * 0.16, 0.62, Math.sin(angle) * 0.16);
      group.add(tooth);
    }
  } else if (type === 'q') {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 16), material);
    body.position.y = 0.47;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), material);
    top.position.y = 0.88;
    group.add(body, top);
  } else if (type === 'k') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.75, 16), material);
    body.position.y = 0.5;
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.07), material);
    crossV.position.y = 1.0;
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.07), material);
    crossH.position.y = 0.96;
    group.add(body, crossV, crossH);
  }

  group.traverse((obj) => { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });
  return group;
}

// Enroque: además de mover el rey, hay que mover la torre — ver flags de
// chess.js ('k' = corto, 'q' = largo). Mapa fijo, las 4 combinaciones
// posibles no cambian nunca.
const CASTLING_ROOK_MOVES = {
  'e1g1': { from: 'h1', to: 'f1' },
  'e1c1': { from: 'a1', to: 'd1' },
  'e8g8': { from: 'h8', to: 'f8' },
  'e8c8': { from: 'a8', to: 'd8' },
};

export default function Board3DExperiment({ onExit }) {
  useEscapeToClose(onExit);
  const containerRef = useRef(null);
  const [phase, setPhase] = useState('setup'); // 'setup' | 'playing'
  const [difficulty, setDifficulty] = useState(30);
  const [status, setStatus] = useState('playing');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(null);

  const sceneRef = useRef(null);
  const chessRef = useRef(new Chess());
  const pieceMeshesRef = useRef({}); // { square: THREE.Group }
  const highlightMeshesRef = useRef({}); // { square: THREE.Mesh } — marcador de resaltado, oculto por defecto
  const materialsRef = useRef({});
  const selectedRef = useRef(null); // casilla elegida — ref, no state, para que el click handler (atado una sola vez) siempre lea el valor actual
  const legalTargetsRef = useRef([]);
  const gameOverRef = useRef(false);
  const thinkingRef = useRef(false);

  useEffect(() => {
    if (phase !== 'playing') return;
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x161b26);

    // Cámara en órbita fija alrededor del tablero — antes se giraba
    // arrastrando con el ratón (OrbitControls), pero eso podía pisarse
    // con el clic de seleccionar pieza (el mismo gesto, clic+arrastre
    // corto, podía interpretarse como "girar cámara" en vez de "elegir
    // pieza"). Ahora la rotación es por botones, un paso fijo por clic —
    // más predecible, sin ese conflicto.
    const CAMERA_RADIUS = 7;
    const CAMERA_HEIGHT = 7.5;
    let cameraAngle = 0;

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);

    function updateCameraPosition() {
      camera.position.set(
        CAMERA_RADIUS * Math.sin(cameraAngle),
        CAMERA_HEIGHT,
        CAMERA_RADIUS * Math.cos(cameraAngle)
      );
      camera.lookAt(0, 0, 0);
    }
    updateCameraPosition();

    function rotateCamera(deltaRadians) {
      cameraAngle += deltaRadians;
      updateCameraPosition();
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 4);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.3, 8.6),
      new THREE.MeshStandardMaterial({ color: COLOR_BOARD_BASE })
    );
    base.position.y = -0.15;
    base.receiveShadow = true;
    scene.add(base);

    // Cada casilla tiene su PROPIA instancia de material (no compartida) —
    // así se puede recolorear una sin afectar a las demás de su mismo
    // color base. Compartir un material entre las 32 casillas claras
    // habría hecho que resaltar UNA las pintara TODAS.
    const squareMeshes = {};
    for (let rank = 1; rank <= 8; rank++) {
      for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
        const file = String.fromCharCode(97 + fileIndex);
        const square = `${file}${rank}`;
        const isLight = (rank + fileIndex) % 2 === 0;
        const mat = new THREE.MeshStandardMaterial({ color: isLight ? COLOR_LIGHT_SQUARE : COLOR_DARK_SQUARE });
        const tile = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.05, 0.98), mat);
        const [x, , z] = squareToPosition(file, rank);
        tile.position.set(x, 0.025, z);
        tile.receiveShadow = true;
        tile.userData.square = square;
        tile.userData.baseColor = isLight ? COLOR_LIGHT_SQUARE : COLOR_DARK_SQUARE;
        scene.add(tile);
        squareMeshes[square] = tile;

        // Marcador de resaltado: un anillo fino apenas por encima de la
        // casilla, invisible por defecto. Separado del material de la
        // casilla misma — así "seleccionada" / "jugada legal" / "última
        // jugada" pueden convivir sin pisarse entre sí como colores
        // mutuamente excluyentes de una sola propiedad.
        const marker = new THREE.Mesh(
          new THREE.RingGeometry(0.32, 0.42, 24),
          new THREE.MeshBasicMaterial({ color: COLOR_SELECTED, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(x, 0.06, z);
        marker.visible = false;
        scene.add(marker);
        highlightMeshesRef.current[square] = marker;
      }
    }

    const whiteMat = new THREE.MeshStandardMaterial({ color: COLOR_WHITE_PIECE });
    const blackMat = new THREE.MeshStandardMaterial({ color: COLOR_BLACK_PIECE });
    materialsRef.current = { whiteMat, blackMat };

    function placePieceMesh(square, type, color) {
      const mesh = buildPieceMesh(type, color === 'w' ? whiteMat : blackMat);
      const file = square[0];
      const rank = parseInt(square[1], 10);
      const [x, y, z] = squareToPosition(file, rank);
      mesh.position.set(x, y, z);
      mesh.userData.square = square;
      scene.add(mesh);
      pieceMeshesRef.current[square] = mesh;
    }

    function rebuildPiecesFromChess() {
      for (const mesh of Object.values(pieceMeshesRef.current)) {
        scene.remove(mesh);
        mesh.traverse((obj) => { if (obj.isMesh) { obj.geometry?.dispose(); } });
      }
      pieceMeshesRef.current = {};
      const board = chessRef.current.board(); // [8][8], board[0] = fila 8
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const cell = board[r][f];
          if (!cell) continue;
          const square = `${String.fromCharCode(97 + f)}${8 - r}`;
          placePieceMesh(square, cell.type, cell.color);
        }
      }
    }
    rebuildPiecesFromChess();

    function clearHighlights() {
      for (const marker of Object.values(highlightMeshesRef.current)) marker.visible = false;
    }

    function showHighlight(square, color) {
      const marker = highlightMeshesRef.current[square];
      if (!marker) return;
      marker.material.color.setHex(color);
      marker.visible = true;
    }

    function refreshHighlights(lastMove) {
      clearHighlights();
      if (lastMove) {
        showHighlight(lastMove.from, COLOR_LAST_MOVE);
        showHighlight(lastMove.to, COLOR_LAST_MOVE);
      }
      if (selectedRef.current) {
        showHighlight(selectedRef.current, COLOR_SELECTED);
        for (const t of legalTargetsRef.current) {
          showHighlight(t.to, t.captured ? COLOR_LEGAL_CAPTURE : COLOR_LEGAL_MOVE);
        }
      }
    }

    function removePieceMesh(square) {
      const mesh = pieceMeshesRef.current[square];
      if (!mesh) return;
      scene.remove(mesh);
      mesh.traverse((obj) => { if (obj.isMesh) obj.geometry?.dispose(); });
      delete pieceMeshesRef.current[square];
    }

    function movePieceMesh(from, to) {
      const mesh = pieceMeshesRef.current[from];
      if (!mesh) return;
      const file = to[0];
      const rank = parseInt(to[1], 10);
      const [x, y, z] = squareToPosition(file, rank);
      mesh.position.set(x, y, z);
      mesh.userData.square = to;
      pieceMeshesRef.current[to] = mesh;
      delete pieceMeshesRef.current[from];
    }

    // Aplica un movimiento YA VALIDADO por chess.js a la escena 3D —
    // maneja captura normal, al paso, enroque (mueve la torre también), y
    // coronación (cambia la malla del peón por una de dama).
    function applyMoveToScene(moveObj) {
      if (moveObj.flags.includes('e')) {
        const capturedSquare = moveObj.to[0] + moveObj.from[1];
        removePieceMesh(capturedSquare);
      } else if (moveObj.captured) {
        removePieceMesh(moveObj.to);
      }

      movePieceMesh(moveObj.from, moveObj.to);

      const castleKey = moveObj.from + moveObj.to;
      if (CASTLING_ROOK_MOVES[castleKey] && (moveObj.flags.includes('k') || moveObj.flags.includes('q'))) {
        const { from: rFrom, to: rTo } = CASTLING_ROOK_MOVES[castleKey];
        movePieceMesh(rFrom, rTo);
      }

      if (moveObj.promotion) {
        removePieceMesh(moveObj.to);
        placePieceMesh(moveObj.to, moveObj.promotion, moveObj.color);
      }
    }

    function statusAfterMove() {
      const chess = chessRef.current;
      if (chess.isCheckmate()) return 'checkmate';
      if (chess.isStalemate()) return 'stalemate';
      if (chess.isDraw()) return 'draw';
      return 'playing';
    }

    async function runCpuTurn() {
      thinkingRef.current = true;
      setThinking(true);
      let suggestion;
      try {
        suggestion = await api.analyzePosition(chessRef.current.fen(), difficulty);
      } catch (e) {
        setError(e.message);
        thinkingRef.current = false;
        setThinking(false);
        return;
      }
      thinkingRef.current = false;
      setThinking(false);
      if (!suggestion) return;

      const moveObj = chessRef.current.move({ from: suggestion.from, to: suggestion.to, promotion: 'q' });
      if (!moveObj) return;
      applyMoveToScene(moveObj);
      refreshHighlights({ from: moveObj.from, to: moveObj.to });

      const next = statusAfterMove();
      setStatus(next);
      gameOverRef.current = next !== 'playing';
    }

    function handleSquareClick(square) {
      if (gameOverRef.current || thinkingRef.current) return;
      const chess = chessRef.current;
      if (chess.turn() !== HUMAN_COLOR) return;

      const piece = chess.get(square);

      if (selectedRef.current === square) {
        selectedRef.current = null;
        legalTargetsRef.current = [];
        refreshHighlights(null);
        return;
      }

      if (selectedRef.current) {
        const target = legalTargetsRef.current.find((t) => t.to === square);
        if (target) {
          const moveObj = chess.move({ from: selectedRef.current, to: square, promotion: 'q' });
          selectedRef.current = null;
          legalTargetsRef.current = [];
          if (moveObj) {
            applyMoveToScene(moveObj);
            refreshHighlights({ from: moveObj.from, to: moveObj.to });
            const next = statusAfterMove();
            setStatus(next);
            gameOverRef.current = next !== 'playing';
            if (next === 'playing') setTimeout(runCpuTurn, 500);
          } else {
            refreshHighlights(null);
          }
          return;
        }
      }

      if (piece && piece.color === HUMAN_COLOR) {
        selectedRef.current = square;
        legalTargetsRef.current = chess.moves({ square, verbose: true }).map((m) => ({ to: m.to, captured: !!m.captured }));
        refreshHighlights(null);
      } else {
        selectedRef.current = null;
        legalTargetsRef.current = [];
        refreshHighlights(null);
      }
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function onPointerDown(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      for (const hit of intersects) {
        let obj = hit.object;
        while (obj && !obj.userData?.square) obj = obj.parent;
        if (obj?.userData?.square) {
          handleSquareClick(obj.userData.square);
          break;
        }
      }
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    let frameId;
    function animate() {
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    animate();

    function handleResize() {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }
    window.addEventListener('resize', handleResize);

    sceneRef.current = { rebuildPiecesFromChess, refreshHighlights, rotateCamera };

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      scene.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material?.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function startGame() {
    chessRef.current = new Chess();
    selectedRef.current = null;
    legalTargetsRef.current = [];
    gameOverRef.current = false;
    setStatus('playing');
    setError(null);
    setPhase('playing');
  }

  function playAgain() {
    chessRef.current = new Chess();
    selectedRef.current = null;
    legalTargetsRef.current = [];
    gameOverRef.current = false;
    setStatus('playing');
    sceneRef.current?.rebuildPiecesFromChess();
    sceneRef.current?.refreshHighlights(null);
  }

  if (phase === 'setup') {
    return (
      <div className="menu">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section">
          <span className="section-label">Experimento 3D</span>
          <span className="board3d-badge">EXPERIMENTAL</span>
          <h2>Jugable de verdad</h2>
          <p className="hero-scope-note">
            Juegas siempre con blancas, sin elegir color ni girar el tablero — eso queda para otra vuelta.
            Coronación automática a dama. El resto es ajedrez real: clic para elegir una pieza, clic en una
            casilla resaltada para mover, la CPU responde de verdad.
          </p>
          <div className="difficulty-slider-row">
            <input
              type="range" min="0" max="100" value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
              className="difficulty-slider"
            />
            <div className="difficulty-readout">
              <span className="difficulty-number">{difficulty}</span>
              <span className="difficulty-word">{difficultyLabel(difficulty)}</span>
            </div>
          </div>
          <button type="button" className="primary-btn" style={{ width: '100%', marginTop: '0.9rem' }} onClick={startGame}>
            Empezar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tutorial-shell">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>

      <div className="board3d-header">
        <span className="board3d-badge">EXPERIMENTAL</span>
        <p className="hint-text">
          Clic para elegir una pieza y clic de nuevo para mover. Punteado azul
          = jugada legal, rojo = captura, dorado = seleccionada / última jugada.
          {thinking && ' La CPU está pensando…'}
        </p>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div ref={containerRef} className="board3d-canvas" />

      <div className="board3d-camera-controls">
        <button type="button" className="secondary-btn" onClick={() => sceneRef.current?.rotateCamera(-Math.PI / 8)}>
          ← Girar
        </button>
        <button type="button" className="secondary-btn" onClick={() => sceneRef.current?.rotateCamera(Math.PI / 8)}>
          Girar →
        </button>
      </div>

      {status !== 'playing' && (
        <div className="endgame-banner">
          <h2>
            {status === 'checkmate' ? (chessRef.current.turn() === 'w' ? 'Jaque mate — ganó la CPU.' : '¡Jaque mate, ganaste!') : 'Tablas.'}
          </h2>
          <button className="primary-btn" onClick={playAgain}>Jugar de nuevo</button>
        </div>
      )}
    </div>
  );
}
