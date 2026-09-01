import { DISPLAY_RANKS, FILES } from './Board3DConfig.js';

export function parseFen(fen) {
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

export function squarePosition(square) {
  const file = FILES.indexOf(square?.[0]);
  const rank = Number(square?.[1]);
  return { x: file - 3.5, z: 4.5 - rank };
}

export function adjacentSquare(square, key, orientation) {
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
