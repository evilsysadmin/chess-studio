import { Chess } from 'chess.js';

export const LAB_START_FEN = new Chess().fen();

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

export function mapFromPlacement(fenOrPlacement) {
  const out = {};
  const part = String(fenOrPlacement || '').trim().split(/\s+/)[0];
  const rows = part.split('/');
  if (rows.length !== 8) return null;
  for (let r = 0; r < 8; r += 1) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/[1-8]/.test(ch)) f += Number(ch);
      else {
        if (!/[prnbqkPRNBQK]/.test(ch) || f > 7) return null;
        out[FILES[f] + RANKS[r]] = ch;
        f += 1;
      }
    }
    if (f !== 8) return null;
  }
  return out;
}

export function placementFromMap(map) {
  return RANKS.map((rank) => {
    let out = '';
    let empty = 0;
    for (const file of FILES) {
      const value = map[file + rank] || '';
      if (!value) { empty += 1; continue; }
      if (empty) { out += empty; empty = 0; }
      out += value;
    }
    if (empty) out += empty;
    return out;
  }).join('/');
}

export function parseLabPosition(raw, fallbackTurn = 'w') {
  const value = String(raw || '').trim();
  const map = mapFromPlacement(value);
  if (!map) throw new Error('FEN/colocación inválida');
  const fields = value.split(/\s+/);

  // Un FEN completo conserva TODOS sus metadatos. Antes el laboratorio
  // descartaba enroques, en-passant y contadores al pegarlo.
  if (fields.length >= 6) {
    const chess = new Chess(value);
    const normalized = chess.fen();
    const normalizedFields = normalized.split(/\s+/);
    return {
      map,
      turn: normalizedFields[1],
      castling: normalizedFields[2],
      ep: normalizedFields[3],
      halfmove: normalizedFields[4],
      fullmove: normalizedFields[5],
      fen: normalized,
    };
  }

  // Con solo la colocación no se pueden inferir derechos históricos de
  // enroque/en-passant. Ser conservadores es más correcto que inventarlos.
  const turn = fallbackTurn === 'b' ? 'b' : 'w';
  const fen = `${placementFromMap(map)} ${turn} - - 0 1`;
  new Chess(fen); // valida reyes/estructura que chess.js sí pueda comprobar
  return { map, turn, castling: '-', ep: '-', halfmove: '0', fullmove: '1', fen };
}

export function fenFromLabState({ map, turn, castling = '-', ep = '-', halfmove = '0', fullmove = '1' }) {
  return `${placementFromMap(map)} ${turn === 'b' ? 'b' : 'w'} ${castling || '-'} ${ep || '-'} ${halfmove || '0'} ${fullmove || '1'}`;
}
