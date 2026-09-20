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
