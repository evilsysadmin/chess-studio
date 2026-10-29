import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import CareerChronicle from './CareerChronicle.jsx';

const season = {
  number: 1, games: 20, target: 20, complete: true,
  wins: 9, draws: 5, losses: 6, scorePct: 58,
  startedAt: '2026-08-01T09:00:00Z', endedAt: '2026-09-02T09:00:00Z',
  rating: { delta: 35, exactBaseline: true },
  bestOpening: { opening: 'Italiana', games: 6, scorePct: 67 },
  bestWin: { id: 'recorded-1', difficulty: 83 },
  worstBlunder: { loss: 220 },
};

describe('Crónica de tu carrera', () => {
  it('does not invent wins or ratings before a player records a competitive game', () => {
    const html = renderToStaticMarkup(<CareerChronicle seasons={[{ ...season, games: 0 }]} />);
    expect(html).toContain('Tu primer capítulo comienza');
    expect(html).not.toContain('Revisar esta partida');
    expect(renderToStaticMarkup(<CareerChronicle seasons={[]} />)).toBe('');
  });

  it('shows documented seasons and opens only unambiguous saved records', () => {
    const html = renderToStaticMarkup(
      <CareerChronicle seasons={[season]} history={[{ id: 'recorded-1', moves: ['e4'] }]} onOpenRecord={() => {}} />,
    );
    expect(html).toContain('Capítulo 1');
    expect(html).toContain('9 victorias');
    expect(html).toContain('20/20 partidas');
    expect(html).toContain('+35');
    expect(html).toContain('Italiana');
    expect(html).toContain('67%');
    expect(html).toContain('Revisar esta partida');
    expect(html).toContain('Consultar autopsia del capítulo');
  });

  it('never makes an ambiguous or missing record seem replayable', () => {
    const html = renderToStaticMarkup(
      <CareerChronicle
        seasons={[{ ...season, rating: null }]}
        history={[{ id: 'recorded-1' }, { id: 'recorded-1' }]}
        onOpenRecord={() => {}}
      />,
    );
    expect(html).not.toContain('Revisar esta partida');
    expect(html).toContain('Replay no disponible');
    expect(html).toContain('sin checkpoints');
  });

  it('exposes older chapter models without recalculating or inventing them', () => {
    const html = renderToStaticMarkup(
      <CareerChronicle seasons={[season, { ...season, number: 2, games: 3, complete: false }]} />,
    );
    expect(html).toContain('Consultar temporada');
    expect(html).toContain('Temporada 1 · completa');
    expect(html).toContain('Temporada 2 · en curso');
    expect(html).toContain('Capítulo 2');
  });
});
