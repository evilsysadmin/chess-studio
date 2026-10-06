import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import ChroniclesMinimap from './ChroniclesMinimap.jsx';

describe('ChroniclesMinimap', () => {
  it('renders a seven-by-seven local window centered on the party', () => {
    const state = createChroniclesState('crypt-eight-squares');
    const html = renderToStaticMarkup(
      <ChroniclesMinimap
        state={state}
        visitedCells={[`${state.x}:${state.y}`]}
      />,
    );

    expect(html).toContain('data-chronicles-minimap="visible"');
    expect(html).toContain('Minimapa local. Abrir automapa completo');
    expect(html).toContain(`viewBox="${state.x - 3} ${state.y - 3} 7 7"`);
    expect(html).toContain('data-chronicles-minimap-facing=');
  });

  it('disappears while the full automap or a terminal overlay owns the scene', () => {
    const state = createChroniclesState('crypt-eight-squares');
    expect(renderToStaticMarkup(
      <ChroniclesMinimap state={state} visitedCells={[]} hidden />,
    )).toBe('');
  });
});
