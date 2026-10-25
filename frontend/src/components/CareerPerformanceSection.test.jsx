import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import CareerPerformanceSection from './CareerPerformanceSection.jsx';

const heat = { activity: {}, captures: {}, losses: {}, totals: {humanMoves:0,humanCaptures:0,humanLosses:0}, maxima:{activity:0,captures:0,losses:0} };
const base = {
  conversion: { converted:0, winningChances:0, conversionPct:null, saved:0, desperatePositions:0, defensePct:null },
  pressure:{incidents:0,moves:0,rate:null}, donations:{points:0,pieces:0,queens:0},
  rpgSummary:{title:'Sin muestra',games:0,measuredCount:0,leader:null,lowest:null},
  rpg:{attributes:[],leaderId:null}, heatmaps:heat,
  hall:{worst:null,missedConversion:null}, recurrence:{repeated:0},
  evolution:[],ratingHistory:[],profile:[],
};

describe('CareerPerformanceSection extraction', () => {
  it('keeps recorded performance panels and empty-state honesty', () => {
    const html=renderToStaticMarkup(<CareerPerformanceSection {...base} />);
    expect(html).toContain('Conversión y defensa');
    expect(html).toContain('Heatmaps de tu tablero');
    expect(html).toContain('Hall of Shame');
    expect(html).toContain('Sin datos bajo 40 s');
    expect(html).toContain('Aún sin muestra');
    expect(html).not.toContain('NaN');
    expect((html.match(/class="career-heat-board"/g)||[])).toHaveLength(3);
  });
  it('renders original measured summaries without inventing a new metric', () => {
    const html=renderToStaticMarkup(<CareerPerformanceSection {...base}
      conversion={{...base.conversion,converted:2,winningChances:3,conversionPct:67}}
      rpgSummary={{...base.rpgSummary,leader:{label:'Conversión',value:67,sample:3}}}
      evolution={[{label:'Últimas 10',winPct:60,avgDifficulty:45}]} />);
    expect(html).toContain('67% convertidas');
    expect(html).toContain('Conversión · 67%');
    expect(html).toContain('Últimas 10');
    expect(html).toContain('nivel medio 45');
  });
});
