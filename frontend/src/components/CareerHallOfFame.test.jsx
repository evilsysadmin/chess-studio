import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { careerHonors, historicalCareerRecord } from '../careerHonors.js';
import CareerHallOfFame from './CareerHallOfFame.jsx';

const history = [
  { id: 'game-hard', outcome: 'win', difficulty: 85, moves: Array(33).fill('e4') },
  { id: 'game-fast', outcome: 'win', difficulty: 25, moves: Array(14).fill('e4') },
];

describe('Salón de la Gloria', () => {
  it('resolves replay only when the underlying game ID has exactly one matching record', () => {
    expect(historicalCareerRecord({ gameId: 'game-hard' }, history)).toBe(history[0]);
    expect(historicalCareerRecord({ sourceGameId: 'game-fast' }, history)).toBe(history[1]);
    expect(historicalCareerRecord({ gameId: 'lost-record' }, history)).toBeNull();
    expect(historicalCareerRecord({ gameId: 'game-hard' }, [history[0], {...history[0]}])).toBeNull();
    expect(historicalCareerRecord(null, history)).toBeNull();
  });

  it('shows only factual distinctions, no invented trophies or empty action', () => {
    const html = renderToStaticMarkup(<CareerHallOfFame hall={{}} history={history} />);
    expect(html).toContain('Aún no hay hazañas acreditadas');
    expect(html).not.toContain('Revisar partida');
    expect(careerHonors({}, history)).toHaveLength(0);
  });

  it('links recorded games and does not link orphaned analysis to a random game', () => {
    const hall = {
      hardestWin: history[0],
      fastestWin: history[1],
      bestAccuracy: { gameId: 'missing', accuracy: 92 },
      desperateSave: { gameId: 'game-fast', troughPerspectiveEval: -430 },
    };
    const honors = careerHonors(hall, history);
    expect(honors).toHaveLength(4);
    expect(honors.find(x=>x.id==='hardest')?.record).toBe(history[0]);
    expect(honors.find(x=>x.id==='fastest')?.record).toBe(history[1]);
    expect(honors.find(x=>x.id==='accuracy')?.record).toBeNull();
    expect(honors.find(x=>x.id==='saved')?.record).toBe(history[1]);
    const html = renderToStaticMarkup(<CareerHallOfFame hall={hall} history={history} onOpenRecord={() => {}} onMovie={() => {}} />);
    expect(html).toContain('Salón de la Gloria');
    expect(html).toContain('CPU nivel 85');
    expect(html).toContain('92%');
    expect(html).toContain('Desde -4.3');
    expect((html.match(/Revisar partida/g) || [])).toHaveLength(3);
    expect((html.match(/Ver película/g) || [])).toHaveLength(3);
  });
});
