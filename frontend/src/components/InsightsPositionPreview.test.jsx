import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import InsightsPositionPreview, { positionPreviewSquares, autopsyArrowCoordinates } from './InsightsPositionPreview.jsx';

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

describe('autopsy arrow orientation', () => {
  it('keeps arrows in the original perspective as the position changes turn', () => {
    expect(autopsyArrowCoordinates('a8', 'w')).toEqual({ x: 50, y: 50 });
    expect(autopsyArrowCoordinates('a8', 'b')).toEqual({ x: 750, y: 750 });
    expect(autopsyArrowCoordinates('h1', 'b')).toEqual({ x: 50, y: 50 });
    expect(autopsyArrowCoordinates('z9', 'w')).toBeNull();
    const board = renderToStaticMarkup(
      <InsightsPositionPreview fen={FEN.replace(' w ', ' b ')} orientation="w" move={{ from: 'a8', to: 'a1', san: 'Ra1+' }} />,
    );
    expect(board).toContain('insights-position-arrow');
    expect(board).toContain('flecha de a8 a a1');
    expect(positionPreviewSquares(FEN.replace(' w ', ' b '), 'w')[0].piece).toBeNull();
  });
});
