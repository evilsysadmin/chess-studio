import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';

const LESSONS = [
  {
    key: 'objetivo',
    eyebrow: 'Lección 1',
    title: 'El objetivo del juego',
    fen: new Chess().fen(),
    text: [
      'Dos jugadores mueven piezas por turnos sobre un tablero de 64 casillas. Empiezan siempre las blancas.',
      'Ganas la partida cuando dejas al rey rival en jaque mate: amenazado de captura y sin ninguna jugada legal para escapar de esa amenaza.',
      'Toca cualquier pieza para ver sus movimientos posibles y explora la posición inicial.',
    ],
  },
  {
    key: 'peon',
    eyebrow: 'Lección 2',
    title: 'El peón',
    fen: 'k7/8/8/8/8/5n2/4P3/K7 w - - 0 1',
    text: [
      'Avanza una casilla hacia adelante, o dos si todavía no se movió desde su posición inicial. Nunca retrocede.',
      'Para capturar lo hace distinto: en diagonal, una casilla, y solo si hay una pieza rival ahí. Nunca captura de frente.',
      'Toca el peón blanco: puede avanzar a e3 o e4, y capturar al caballo negro en f3.',
      'Curiosidad: si un peón llega a la última fila, se corona — se convierte en la pieza que el jugador elija (casi siempre dama).',
    ],
  },
  {
    key: 'torre',
    eyebrow: 'Lección 3',
    title: 'La torre',
    fen: '7k/3p4/8/8/3R2n1/8/8/K7 w - - 0 1',
    text: [
      'Se mueve en línea recta, tantas casillas como quiera, en horizontal o en vertical.',
      'No puede saltar piezas: se frena antes de una propia, o captura y se detiene si es rival.',
      'Toca la torre blanca: en la columna "d" puede avanzar y capturar el peón en d7; en la fila 4 puede capturar al caballo en g4.',
    ],
  },
  {
    key: 'alfil',
    eyebrow: 'Lección 4',
    title: 'El alfil',
    fen: 'k7/8/1n6/8/3B4/8/8/7K w - - 0 1',
    text: [
      'Se mueve en diagonal, tantas casillas como quiera. Por eso cada alfil queda toda la partida en casillas del mismo color en el que empezó.',
      'Cada bando tiene dos: uno de casillas claras y otro de casillas oscuras.',
      'Toca el alfil blanco y mira cómo se desliza por sus diagonales, incluida la captura del caballo en b6.',
    ],
  },
  {
    key: 'caballo',
    eyebrow: 'Lección 5',
    title: 'El caballo',
    fen: 'k7/8/8/5p2/3N4/8/8/7K w - - 0 1',
    text: [
      'Se mueve en forma de "L": dos casillas en una dirección y después una perpendicular.',
      'Es la única pieza que salta por encima de las demás — no le importa qué haya en el camino.',
      'Toca el caballo blanco: tiene hasta 8 destinos posibles, incluida la captura del peón en f5.',
    ],
  },
  {
    key: 'dama',
    eyebrow: 'Lección 6',
    title: 'La dama',
    fen: '1k6/3p4/8/3Q4/8/8/8/1K6 w - - 0 1',
    text: [
      'Combina los poderes de la torre y el alfil: se mueve en línea recta o en diagonal, tantas casillas como quiera.',
      'Es la pieza más poderosa del tablero — perderla suele ser un golpe muy duro.',
      'Toca la dama blanca y fíjate cuántas casillas controla desde el centro.',
    ],
  },
  {
    key: 'rey',
    eyebrow: 'Lección 7',
    title: 'El rey',
    fen: 'k7/8/8/8/3K4/8/8/8 w - - 0 1',
    text: [
      'Se mueve una sola casilla, en cualquier dirección: horizontal, vertical o diagonal.',
      'Es la pieza más importante — si queda en jaque mate, la partida termina.',
      'Nunca puede moverse a una casilla donde quedaría capturado, ni acercarse demasiado al rey rival.',
    ],
  },
  {
    key: 'enroque',
    eyebrow: 'Lección 8',
    title: 'El enroque',
    fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1',
    text: [
      'Es la única jugada donde se mueven dos piezas a la vez: el rey y una torre.',
      'El rey se corre dos casillas hacia la torre elegida, y esa torre salta al otro lado del rey.',
      'Solo se puede hacer si ninguna de las dos piezas se movió antes, no hay piezas entre medio, y el rey no está en jaque ni pasa por una casilla atacada.',
      'Toca el rey blanco: una de sus opciones es enrocarse corto, hacia g1.',
    ],
  },
  {
    key: 'jaque',
    eyebrow: 'Lección 9',
    title: 'Jaque y jaque mate',
    fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
    text: [
      'El rey está en jaque cuando una pieza rival lo amenaza directamente. Hay que resolverlo enseguida: moviendo el rey, bloqueando el ataque, o capturando a la pieza que amenaza.',
      'Si no existe ninguna forma de salir del jaque, es jaque mate y la partida termina ahí mismo.',
      'Esta posición es un jaque mate real — de hecho, el más rápido posible en una partida (se llama "mate del loco"). Las blancas no tienen ningún movimiento legal.',
    ],
  },
  {
    key: 'cierre',
    eyebrow: 'Última lección',
    title: 'Ya sabes lo esencial',
    fen: new Chess().fen(),
    text: [
      'Con esto alcanza para jugar una partida completa: cómo se mueve cada pieza, qué es el enroque, y qué significa jaque mate.',
      'El resto — aperturas, táctica, finales — se aprende jugando y mirando tus propias partidas. Las aperturas famosas tienen su propia sección en el menú, con recorrido paso a paso.',
      'Vuelve al menú y prueba una partida contra la CPU en modo fácil para practicar.',
    ],
  },
];

// Reemplaza el campo "turno" de un FEN por el color indicado, para poder
// consultar jugadas legales de cualquier pieza en el sandbox del tutorial
// sin importar a quién le tocaría jugar en una partida real.
function withTurn(fen, color) {
  const parts = fen.split(' ');
  parts[1] = color;
  return parts.join(' ');
}

export default function Tutorial({ onExit }) {
  useEscapeToClose(onExit);
  const [index, setIndex] = useState(0);
  const [practiceFen, setPracticeFen] = useState(LESSONS[0].fen);
  const [selected, setSelected] = useState(null);

  const lesson = LESSONS[index];

  function goTo(newIndex) {
    const clamped = Math.max(0, Math.min(LESSONS.length - 1, newIndex));
    setIndex(clamped);
    setPracticeFen(LESSONS[clamped].fen);
    setSelected(null);
  }

  const legalTargets = useMemo(() => {
    if (!selected) return [];
    const piece = new Chess(practiceFen).get(selected);
    if (!piece) return [];
    const temp = new Chess(withTurn(practiceFen, piece.color));
    return temp.moves({ square: selected, verbose: true }).map((m) => ({ to: m.to, san: m.san }));
  }, [selected, practiceFen]);

  function handleSquareClick(square) {
    const board = new Chess(practiceFen);
    const piece = board.get(square);

    if (selected) {
      const move = legalTargets.find((m) => m.to === square);
      if (move) {
        const selectedPiece = board.get(selected);
        const temp = new Chess(withTurn(practiceFen, selectedPiece.color));
        temp.move({ from: selected, to: square, promotion: 'q' });
        setPracticeFen(temp.fen());
        setSelected(null);
        return;
      }
    }

    if (piece) setSelected(square);
    else setSelected(null);
  }

  return (
    <div className="tutorial-shell">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
        <div className="board-column">
          <Board
            fen={practiceFen}
            onSquareClick={handleSquareClick}
            selectedSquare={selected}
            legalTargets={legalTargets}
          />
          <button className="secondary-btn" onClick={() => { setPracticeFen(lesson.fen); setSelected(null); }}>
            Reiniciar posición
          </button>
        </div>

        <div className="tutorial-text">
          <span className="eyebrow">{lesson.eyebrow}</span>
          <h2>{lesson.title}</h2>
          {lesson.text.map((p, i) => <p key={i}>{p}</p>)}

          <div className="tutorial-nav">
            <button className="secondary-btn" onClick={() => goTo(index - 1)} disabled={index === 0}>
              Anterior
            </button>
            <span className="tutorial-progress">Lección {index + 1} de {LESSONS.length}</span>
            {index < LESSONS.length - 1 ? (
              <button className="primary-btn" onClick={() => goTo(index + 1)}>Siguiente</button>
            ) : (
              <button className="primary-btn" onClick={onExit}>Ir a jugar</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
