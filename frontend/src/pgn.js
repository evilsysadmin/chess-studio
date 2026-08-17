// pgn.js — Exporta el historial de una partida (lista de jugadas SAN) al
// formato PGN estándar, para poder analizarla después en Lichess, Chess.com
// o cualquier programa de ajedrez.

function pgnDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

// `history` es el array de jugadas tal como lo devuelve el backend/registro
// del juego: [{ san, from, to, ... }, ...]. `meta` describe la partida:
// { white, black, result, date, event }. `result` tiene que ser uno de
// "1-0", "0-1", "1/2-1/2" o "*" (partida sin terminar).
export function toPGN(history, meta = {}) {
  const {
    white = 'Jugador',
    black = 'CPU',
    result = '*',
    date,
    event = 'Estudio de ajedrez',
  } = meta;

  const headers = [
    `[Event "${event}"]`,
    `[Site "Estudio de ajedrez"]`,
    `[Date "${pgnDate(date)}"]`,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${result}"]`,
  ].join('\n');

  let moveText = '';
  for (let i = 0; i < history.length; i += 2) {
    const num = i / 2 + 1;
    moveText += `${num}. ${history[i].san} `;
    if (history[i + 1]) moveText += `${history[i + 1].san} `;
  }
  moveText += result;

  return `${headers}\n\n${moveText.trim()}\n`;
}

// Arma el resultado PGN ("1-0" / "0-1" / "1/2-1/2" / "*") a partir del
// estado del juego, sabiendo de qué color jugó el humano.
export function pgnResult(status, turn, humanColor) {
  if (status === 'checkmate') {
    const humanLost = turn === humanColor;
    return humanLost ? (humanColor === 'w' ? '0-1' : '1-0') : (humanColor === 'w' ? '1-0' : '0-1');
  }
  if (['draw', 'stalemate', 'repetition'].includes(status)) return '1/2-1/2';
  return '*';
}

export function downloadPGN(pgnText, filename = 'partida.pgn') {
  const blob = new Blob([pgnText], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
