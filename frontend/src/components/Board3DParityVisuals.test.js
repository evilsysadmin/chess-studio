import { describe, expect, it } from 'vitest';
import {
  board3DForensicGhost,
  board3DTechniqueTargetCount,
  board3DTerrainSquares,
  buildBoard3DLegalMap,
} from './Board3DParityVisuals.js';

describe('Board3D special-surface parity visuals', () => {
  it('preserves Combat technique metadata instead of flattening every target to legal/capture', () => {
    const map = buildBoard3DLegalMap([
      { to: 'e4', san: 'e4' },
      { to: 'd5', san: 'exd5', captured: 'p' },
      { to: 'f5', technique: 'lunge' },
    ]);
    expect(map.get('e4')).toEqual({ capture: false, technique: false });
    expect(map.get('d5')).toEqual({ capture: true, technique: false });
    expect(map.get('f5')).toEqual({ capture: false, technique: true });
    expect(board3DTechniqueTargetCount([{ to: 'f5', technique: 'lunge' }, { to: 'e4' }])).toBe(1);
  });

  it('extracts Arena terrain from the shared parity highlights', () => {
    expect(board3DTerrainSquares({ parityHighlights: { d4: 'terrain', e4: 'legal', f6: 'terrain' } })).toEqual(['d4', 'f6']);
  });

  it('reconstructs the forensic ghost only when the played piece really left the source square', () => {
    expect(board3DForensicGhost({ from: 'f3', to: 'g5', piece: 'N' }, [{ square: 'g5', type: 'n', color: 'w' }]))
      .toEqual({ square: 'f3', type: 'n', color: 'w' });
    expect(board3DForensicGhost({ from: 'f3', to: 'g5', piece: 'n' }, [{ square: 'g5', type: 'n', color: 'b' }]))
      .toEqual({ square: 'f3', type: 'n', color: 'b' });
    expect(board3DForensicGhost({ from: 'f3', to: 'g5', piece: 'N' }, [{ square: 'f3', type: 'n', color: 'w' }]))
      .toBeNull();
  });
});
