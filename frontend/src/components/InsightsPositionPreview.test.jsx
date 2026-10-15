import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import InsightsPositionPreview, { positionPreviewSquares } from './InsightsPositionPreview.jsx';

const FEN = '8/8/8/8/8/8/1p6/K6k w - - 0 1';

describe('InsightsPositionPreview', () => {
  it('renders a true read-only position without disclosing moves', () => {
    const html = renderToStaticMarkup(<InsightsPositionPreview fen={FEN} />);
    expect(html).toContain('Vista previa de una posición real de ajedrez');
    expect(html).not.toContain('<button');
    expect((html.match(/insights-position-square /g) || []).length).toBe(64);
    expect(positionPreviewSquares(FEN).filter((square) => square.piece)).toHaveLength(3);
  });

  it('orients black to move and never fabricates an invalid board', () => {
    const black = positionPreviewSquares(FEN.replace(' w ', ' b '));
    expect(black?.[0]?.piece).toBe('♚');
    expect(positionPreviewSquares('8/8/8/8/8/8/8 w - - 0 1')).toBeNull();
    expect(renderToStaticMarkup(<InsightsPositionPreview fen={null} />)).toBe('');
  });
});
