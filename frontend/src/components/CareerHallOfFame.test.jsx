import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CareerHallOfFame from './CareerHallOfFame.jsx';

describe('CareerHallOfFame extraction', () => {
  it('keeps the four measured accolades and a truthful empty state', () => {
    const html = renderToStaticMarkup(<CareerHallOfFame hall={{}} />);
    expect(html).toContain('Hall of Fame');
    expect((html.match(/class="museum-card"/g) || [])).toHaveLength(4);
    expect(html).toContain('victoria de mayor dificultad');
    expect(html).toContain('mejor precisión archivada');
    expect(html).not.toContain('NaN');
  });

  it('uses supplied factual career values without generating its own record', () => {
    const hall = {
      hardestWin: { difficulty: 85 },
      fastestWin: { moves: Array(23).fill('e4') },
      bestAccuracy: { accuracy: 89 },
      desperateSave: { troughPerspectiveEval: -450 },
    };
    const html = renderToStaticMarkup(<CareerHallOfFame hall={hall} />);
    expect(html).toContain('CPU · nivel 85');
    expect(html).toContain('12 mov.');
    expect(html).toContain('89%');
    expect(html).toContain('-4.5');
  });
});
