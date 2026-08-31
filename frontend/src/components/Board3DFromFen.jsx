import { useEffect, useMemo, useState } from 'react';
import { loadSelectedSkin } from '../tournamentRewards.js';
import { loadBoardTheme } from '../career.js';
import { board3dPieceImages } from '../board3dPieceTextures.js';
import Board3D from './Board3D.jsx';

function parseFen(fen) {
  const empty = () => Array.from({ length: 8 }, () => Array(8).fill(''));
  if (typeof fen !== 'string') return empty();
  const placement = fen.trim().split(/\s+/)[0] || '';
  const rows = placement.split('/');
  if (rows.length !== 8) return empty();
  const grid = [];
  for (const row of rows) {
    const cells = [];
    for (const ch of row) {
      if (/^[1-8]$/.test(ch)) {
        for (let i = 0; i < Number(ch); i += 1) cells.push('');
      } else if (/^[prnbqkPRNBQK]$/.test(ch)) {
        cells.push(ch);
      } else {
        return empty();
      }
    }
    if (cells.length !== 8) return empty();
    grid.push(cells);
  }
  return grid;
}

export default function Board3DFromFen({ fen, themeOverride = null, ...props }) {
  const [pieceSkin, setPieceSkin] = useState(() => loadSelectedSkin());
  const grid = useMemo(() => parseFen(fen), [fen]);
  const pieceImages = useMemo(() => board3dPieceImages(pieceSkin), [pieceSkin]);
  const theme = themeOverride || loadBoardTheme();

  useEffect(() => {
    const refreshSkin = (event) => setPieceSkin(event?.detail || loadSelectedSkin());
    window.addEventListener('chess-piece-skin-change', refreshSkin);
    return () => window.removeEventListener('chess-piece-skin-change', refreshSkin);
  }, []);

  return <Board3D grid={grid} pieceImages={pieceImages} theme={theme} {...props} />;
}
