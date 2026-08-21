import React, { useEffect, useRef, useState } from 'react';
import { levelTier } from '../combat.js';
// Skin "Clásico" (crema/dorado + carbón/carmesí) — la de siempre, sin sufijo de carpeta.
import bB from '../pieces-medieval/bB.png';
import bK from '../pieces-medieval/bK.png';
import bN from '../pieces-medieval/bN.png';
import bP from '../pieces-medieval/bP.png';
import bQ from '../pieces-medieval/bQ.png';
import bR from '../pieces-medieval/bR.png';
import wB from '../pieces-medieval/wB.png';
import wK from '../pieces-medieval/wK.png';
import wN from '../pieces-medieval/wN.png';
import wP from '../pieces-medieval/wP.png';
import wQ from '../pieces-medieval/wQ.png';
import wR from '../pieces-medieval/wR.png';
// Skin "Azulado" — se desbloquea en nivel de torneo 10.
import bB_azul from '../pieces-medieval-azul/bB.png';
import bK_azul from '../pieces-medieval-azul/bK.png';
import bN_azul from '../pieces-medieval-azul/bN.png';
import bP_azul from '../pieces-medieval-azul/bP.png';
import bQ_azul from '../pieces-medieval-azul/bQ.png';
import bR_azul from '../pieces-medieval-azul/bR.png';
import wB_azul from '../pieces-medieval-azul/wB.png';
import wK_azul from '../pieces-medieval-azul/wK.png';
import wN_azul from '../pieces-medieval-azul/wN.png';
import wP_azul from '../pieces-medieval-azul/wP.png';
import wQ_azul from '../pieces-medieval-azul/wQ.png';
import wR_azul from '../pieces-medieval-azul/wR.png';
// Skin "Esmeralda" — se desbloquea en nivel de torneo 25.
import bB_esmeralda from '../pieces-medieval-esmeralda/bB.png';
import bK_esmeralda from '../pieces-medieval-esmeralda/bK.png';
import bN_esmeralda from '../pieces-medieval-esmeralda/bN.png';
import bP_esmeralda from '../pieces-medieval-esmeralda/bP.png';
import bQ_esmeralda from '../pieces-medieval-esmeralda/bQ.png';
import bR_esmeralda from '../pieces-medieval-esmeralda/bR.png';
import wB_esmeralda from '../pieces-medieval-esmeralda/wB.png';
import wK_esmeralda from '../pieces-medieval-esmeralda/wK.png';
import wN_esmeralda from '../pieces-medieval-esmeralda/wN.png';
import wP_esmeralda from '../pieces-medieval-esmeralda/wP.png';
import wQ_esmeralda from '../pieces-medieval-esmeralda/wQ.png';
import wR_esmeralda from '../pieces-medieval-esmeralda/wR.png';
import { loadSelectedSkin } from '../tournamentRewards.js';
import { loadBoardTheme } from '../career.js';

const CAPTURE_PARTICLE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

// Efecto de "golpe" al capturar: un destello circular en la casilla, una
// sacudida breve de la pieza que acaba de llegar, y partículas pixeladas
// (cuadraditos, no círculos — encaja con el pixel art) que salen disparadas
// del punto de impacto. Se dispara al terminar el deslizamiento, no antes,
// para que se sienta como el impacto de la captura.
function playCaptureImpact(squareEl, pieceEl) {
  const burst = document.createElement('span');
  burst.className = 'impact-burst';
  squareEl.appendChild(burst);
  burst.addEventListener('animationend', () => burst.remove(), { once: true });

  for (const deg of CAPTURE_PARTICLE_ANGLES) {
    const rad = (deg * Math.PI) / 180;
    const dx = Math.cos(rad) * 26;
    const dy = Math.sin(rad) * 26;
    const particle = document.createElement('span');
    particle.className = 'capture-particle';
    particle.style.setProperty('--dx', `${dx}px`);
    particle.style.setProperty('--dy', `${dy}px`);
    squareEl.appendChild(particle);
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
  }

  pieceEl.classList.add('capture-shake');
  pieceEl.addEventListener('animationend', () => pieceEl.classList.remove('capture-shake'), { once: true });
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

// Calcula la casilla vecina en la dirección de una flecha del teclado,
// respetando cómo se ve realmente el tablero según la orientación (si está
// girado para jugar con negras, las flechas tienen que sentirse "hacia
// arriba de la pantalla", no "hacia la fila 8" a secas). Devuelve null si
// la vecina caería fuera del tablero.
function adjacentSquare(square, key, orientation) {
  const fIdx = FILES.indexOf(square[0]);
  const rIdx = RANKS.indexOf(square[1]);
  let df = 0;
  let dr = 0;
  if (key === 'ArrowRight') df = 1;
  else if (key === 'ArrowLeft') df = -1;
  else if (key === 'ArrowUp') dr = -1; // hacia la fila 8 en tablero sin girar
  else if (key === 'ArrowDown') dr = 1;
  else return null;

  if (orientation === 'black') { df = -df; dr = -dr; } // todo se ve invertido con el tablero girado

  const newF = fIdx + df;
  const newR = rIdx + dr;
  if (newF < 0 || newF > 7 || newR < 0 || newR > 7) return null;
  return FILES[newF] + RANKS[newR];
}

// Set de piezas medieval en pixel art, diseño propio (32×40, PNG con
// contorno automático) — no es Cburnett ni ningún asset de terceros.
// Mapa de silueta calcado a partir de referencias visuales antes de cada
// pieza (proporciones/muescas/picos), coloreado desde cero: blancas en
// crema+dorado, negras en carbón+carmesí. Reemplazó al set SVG "Cburnett"
// (Colin M.L. Burnett/Lichess, GPLv2+) que se usó hasta esta ronda.
const PIECE_IMAGES_BY_SKIN = {
  default: {
    p: bP, n: bN, b: bB, r: bR, q: bQ, k: bK,
    P: wP, N: wN, B: wB, R: wR, Q: wQ, K: wK,
  },
  azul: {
    p: bP_azul, n: bN_azul, b: bB_azul, r: bR_azul, q: bQ_azul, k: bK_azul,
    P: wP_azul, N: wN_azul, B: wB_azul, R: wR_azul, Q: wQ_azul, K: wK_azul,
  },
  esmeralda: {
    p: bP_esmeralda, n: bN_esmeralda, b: bB_esmeralda, r: bR_esmeralda, q: bQ_esmeralda, k: bK_esmeralda,
    P: wP_esmeralda, N: wN_esmeralda, B: wB_esmeralda, R: wR_esmeralda, Q: wQ_esmeralda, K: wK_esmeralda,
  },
};

const PIECE_NAMES = {
  p: 'peón negro', n: 'caballo negro', b: 'alfil negro', r: 'torre negra', q: 'dama negra', k: 'rey negro',
  P: 'peón blanco', N: 'caballo blanco', B: 'alfil blanco', R: 'torre blanca', Q: 'dama blanca', K: 'rey blanco',
};

// Convierte un FEN (solo la parte de piezas) en una matriz [rank][file] de símbolos ("" si vacío).
function parseFen(fen) {
  const placement = fen.split(' ')[0];
  const rows = placement.split('/');
  return rows.map((row) => {
    const cells = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < parseInt(ch, 10); i++) cells.push('');
      } else {
        cells.push(ch);
      }
    }
    return cells;
  });
}

/**
 * Tablero visual controlado desde afuera: recibe el FEN a mostrar y notifica
 * clicks de casillas. No conoce reglas de ajedrez — eso lo maneja quien lo usa.
 */
export default function Board({
  fen,
  onSquareClick,
  selectedSquare,
  legalTargets = [],
  lastMove,
  orientation = 'white',
  animate, // { from, to, seq } — dispara la animación de deslizamiento
  hintMove, // { from, to } — sugerencia del motor a resaltar
  pieceLevels, // { casilla: nivel } — insignias de nivel (solo Modo Combate)
  pieceXp, // { casilla: xpBancado } — insignia de "tiene XP sin gastar" (solo Modo Combate)
  onSquareDoubleClick, // (casilla) => void — doble clic para ver info de la pieza
  mistakeMove, // { from, to, piece } — la jugada jugada, en las pantallas de revisión de errores:
  showCoordinates = true, // false en Modo Zen: no cambia reglas ni accesibilidad del tablero
  // encuadre rojo (distinto del dorado genérico de lastMove) + pieza fantasma semitransparente
  // en la casilla de origen, para que quede claro qué jugada se está señalando como error.
}) {
  // La skin se lee acá adentro (no como prop) para que ninguna de las
  // muchas pantallas que ya usan <Board> necesite tocarse — cambiar la
  // skin elegida en la pantalla de recompensas alcanza para que todo
  // tablero nuevo que se monte la use, sin plomería adicional.
  const pieceImages = PIECE_IMAGES_BY_SKIN[loadSelectedSkin()] || PIECE_IMAGES_BY_SKIN.default;
  const grid = parseFen(fen);
  const files = orientation === 'white' ? FILES : [...FILES].reverse();
  const ranks = orientation === 'white' ? RANKS : [...RANKS].reverse();
  const squareRefs = useRef({});
  const lastAnimatedSeq = useRef(0);

  // "Roving tabindex": solo la casilla enfocada tiene tabIndex=0 (una sola
  // parada de Tab para entrar al tablero, no 64), las demás -1. Las
  // flechas mueven el foco entre casillas vecinas; Enter/Espacio activa la
  // casilla enfocada, igual que un clic.
  const [focusedSquare, setFocusedSquare] = useState(orientation === 'white' ? 'e1' : 'e8');

  function handleSquareKeyDown(e, square) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSquareClick?.(square);
      return;
    }
    if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      onSquareDoubleClick?.(square);
      return;
    }
    const next = adjacentSquare(square, e.key, orientation);
    if (next) {
      e.preventDefault();
      setFocusedSquare(next);
      squareRefs.current[next]?.focus();
    }
  }

  // Animación "FLIP": la pieza ya está dibujada en su casilla final (React ya
  // re-renderizó), así que la corremos visualmente hasta la posición de la
  // casilla de origen con un transform instantáneo, y en el frame siguiente
  // la soltamos a (0,0) con transición — el navegador anima el salto.
  useEffect(() => {
    if (!animate || !animate.seq || animate.seq === lastAnimatedSeq.current) return;
    lastAnimatedSeq.current = animate.seq;

    const fromEl = squareRefs.current[animate.from];
    const toEl = squareRefs.current[animate.to];
    if (!fromEl || !toEl) return;

    // Esquive: el atacante NO llegó a moverse (la jugada no se aplicó), así
    // que en vez de deslizarlo lo hacemos "amagar" hacia el objetivo y
    // volver a su casilla, mientras la pieza defensora se sacude — se
    // siente claramente distinto a un golpe que sí conecta.
    if (animate.kind === 'miss') {
      const attackerEl = fromEl.querySelector('img.piece');
      const defenderEl = toEl.querySelector('img.piece');
      let bounceTimer;
      let cleanupTimer;

      if (attackerEl) {
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const dx = (toRect.left - fromRect.left) * 0.38;
        const dy = (toRect.top - fromRect.top) * 0.38;

        attackerEl.style.transition = 'transform 0.14s ease-out';
        attackerEl.style.transform = `translate(${dx}px, ${dy}px)`;
        attackerEl.style.zIndex = '5';

        bounceTimer = setTimeout(() => {
          attackerEl.style.transition = 'transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1)';
          attackerEl.style.transform = 'translate(0, 0)';
        }, 150);
        cleanupTimer = setTimeout(() => {
          attackerEl.style.transition = '';
          attackerEl.style.transform = '';
          attackerEl.style.zIndex = '';
        }, 150 + 260);
      }

      if (defenderEl) {
        defenderEl.classList.add('dodge-flinch');
        defenderEl.addEventListener('animationend', () => defenderEl.classList.remove('dodge-flinch'), { once: true });
      }

      return () => { clearTimeout(bounceTimer); clearTimeout(cleanupTimer); };
    }

    const pieceEl = toEl.querySelector('img.piece');
    if (!pieceEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const dx = fromRect.left - toRect.left;
    const dy = fromRect.top - toRect.top;

    pieceEl.style.transition = 'none';
    pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
    pieceEl.style.zIndex = '5';
    // Forzamos reflow para que el navegador registre la posición inicial
    // antes de animar al destino.
    // eslint-disable-next-line no-unused-expressions
    pieceEl.getBoundingClientRect();

    const raf = requestAnimationFrame(() => {
      pieceEl.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
      pieceEl.style.transform = 'translate(0, 0)';
    });

    const cleanup = () => {
      pieceEl.style.transition = '';
      pieceEl.style.transform = '';
      pieceEl.style.zIndex = '';
      if (animate.capture) playCaptureImpact(toEl, pieceEl);
    };
    pieceEl.addEventListener('transitionend', cleanup, { once: true });

    return () => cancelAnimationFrame(raf);
  }, [animate, fen]);

  return (
    <div className={`board-wrap board-theme-${loadBoardTheme()} ${showCoordinates ? 'coordinates-visible' : 'coordinates-hidden'}`}>
      {showCoordinates && (
        <div className="rank-labels">
          {ranks.map((r) => <span key={r}>{r}</span>)}
        </div>
      )}
      <div className="board-grid">
        {ranks.map((rank, rIdxDisplay) => {
          const rIdx = RANKS.indexOf(rank);
          return files.map((file, fIdxDisplay) => {
            const fIdx = FILES.indexOf(file);
            const square = `${file}${rank}`;
            const piece = grid[rIdx][fIdx];
            const isLight = (fIdx + rIdx) % 2 === 0;
            const isSelected = selectedSquare === square;
            const target = legalTargets.find((m) => m.to === square);
            const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);
            const isHint = hintMove && (hintMove.from === square || hintMove.to === square);
            const isMistakeSquare = mistakeMove && (mistakeMove.from === square || mistakeMove.to === square);
            const isMistakeOrigin = mistakeMove && mistakeMove.from === square && !piece;

            const classes = ['square', isLight ? 'light' : 'dark'];
            if (isSelected) classes.push('selected');
            if (target) classes.push(target.san?.includes('x') ? 'legal-capture' : 'legal-move');
            if (isLastMove) classes.push('last-move');
            if (isHint) classes.push('hint-move');
            if (isMistakeSquare) classes.push('mistake-move');

            return (
              <div
                key={square}
                ref={(el) => { squareRefs.current[square] = el; }}
                className={classes.join(' ')}
                onClick={() => onSquareClick?.(square)}
                onDoubleClick={() => onSquareDoubleClick?.(square)}
                onKeyDown={(e) => handleSquareKeyDown(e, square)}
                onFocus={() => setFocusedSquare(square)}
                role="button"
                aria-label={`Casilla ${square}${piece ? `, ${PIECE_NAMES[piece]}` : ', vacía'}${isSelected ? ', seleccionada' : ''}${piece && onSquareDoubleClick ? '. Tecla i para ver detalles' : ''}`}
                tabIndex={focusedSquare === square ? 0 : -1}
              >
                {piece && pieceLevels?.[square] > 1 && (
                  <span className={`piece-level-glow tier-${levelTier(pieceLevels[square])}`} />
                )}
                {piece && (
                  <img
                    className={`piece ${piece === piece.toUpperCase() ? 'white' : 'black'}`}
                    src={pieceImages[piece]}
                    alt={PIECE_NAMES[piece]}
                    draggable={false}
                  />
                )}
                {isMistakeOrigin && mistakeMove.piece && (
                  <img
                    className={`piece piece-ghost ${mistakeMove.piece === mistakeMove.piece.toUpperCase() ? 'white' : 'black'}`}
                    src={pieceImages[mistakeMove.piece]}
                    alt=""
                    draggable={false}
                  />
                )}
                {piece && pieceLevels?.[square] > 1 && (
                  <span className="piece-level-badge">{pieceLevels[square]}</span>
                )}
                {piece && pieceXp?.[square] > 0 && (
                  <span className="piece-xp-badge" title={`${pieceXp[square]} XP sin gastar`}>
                    {pieceXp[square] > 9 ? '9+' : pieceXp[square]}
                  </span>
                )}
              </div>
            );
          });
        })}
      </div>
      {showCoordinates && <div />}
      {showCoordinates && (
        <div className="file-labels">
          {files.map((f) => <span key={f}>{f}</span>)}
        </div>
      )}
    </div>
  );
}
