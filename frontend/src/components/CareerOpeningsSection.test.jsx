import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CareerOpeningsSection from './CareerOpeningsSection.jsx';

describe('CareerOpeningsSection', () => {
  it('preserves the factual opening rivalry and clinic when there is enough history', () => {
    const row = { opening: 'Apertura italiana', wins: 2, draws: 1, losses: 3, scorePct: 42, games: 6, avgDifficulty: 61 };
    const html = renderToStaticMarkup(<CareerOpeningsSection
      openings={[row]}
      clinic={[row]}
      tree={{ count: 0 }}
    />);
    expect(html).toContain('Rivalidad por aperturas');
    expect(html).toContain('Clínica de aperturas');
    expect(html).toContain('Apertura italiana');
    expect(html).toContain('42%');
    expect(html).toContain('nivel medio 61');
  });

  it('preserves a three-ply tree without inventing new variants', () => {
    const html = renderToStaticMarkup(<CareerOpeningsSection
      tree={{ count: 2, children: { e4: { move: 'e4', count: 2, wins: 1, children: { e5: { move: 'e5', count: 1, wins: 1, children: {} } } } } }}
    />);
    expect(html).toContain('Atlas de aperturas')
    expect(html).toContain('Ver árbol de aperturas completo');
    expect(html).toContain('e4');
    expect(html).toContain('e5');
    expect(html).not.toContain('Clínica de aperturas');
  });

  it('renders no made-up data when no opening records exist', () => {
    const html = renderToStaticMarkup(<CareerOpeningsSection />);
    expect(html).not.toContain('Rivalidad por aperturas');
    expect(html).not.toContain('Mapa de aperturas');
  });
});
