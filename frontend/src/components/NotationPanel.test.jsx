import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import NotationPanel from './NotationPanel.jsx';

describe('NotationPanel difficulty identity', () => {
  it('shows Matthias with a human label and hides the raw 0–100 engine level', () => {
    const html = renderToStaticMarkup(
      <NotationPanel history={[]} difficulty={0} />,
    );

    expect(html).toContain('Matthias · Principiante');
    expect(html).not.toContain('CPU · nivel');
    expect(html).not.toContain('nivel 0');
  });
});


describe('NotationPanel post-game review', () => {
  it('anota sólo las jugadas que tienen comparación minimax', () => {
    const history = [
      { san: 'e4', from: 'e2', to: 'e4' },
      { san: 'e5', from: 'e7', to: 'e5' },
    ];
    const analysisReport = {
      moveReports: [{ index: 0, severity: 'inaccuracy', loss: 35, suggested: 'Nf3' }],
    };
    const html = renderToStaticMarkup(
      <NotationPanel history={history} difficulty={45} analysisReport={analysisReport} />,
    );
    expect(html).toContain('Revisión minimax');
    expect(html).toContain('?!');
    expect(html).toContain('ideal Nf3');
    expect(html).not.toContain('??');
  });
});
