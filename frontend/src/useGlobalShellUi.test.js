import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useGlobalShellUi } from './useGlobalShellUi.js';

function Probe() {
  const { rating, combatOverview } = useGlobalShellUi('menu', () => {});
  return createElement('output', {
    'data-rating-type': typeof rating,
    'data-credits-type': typeof combatOverview.credits,
    'data-rank-type': typeof combatOverview.rank,
  });
}

describe('global shell player overview', () => {
  it('deriva rating y Combat desde sus owners existentes', () => {
    const html = renderToStaticMarkup(createElement(Probe));
    expect(html).toContain('data-rating-type="object"');
    expect(html).toContain('data-credits-type="number"');
    expect(html).toContain('data-rank-type="object"');
  });
});
