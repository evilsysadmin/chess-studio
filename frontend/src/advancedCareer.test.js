import { describe, expect, it, beforeEach } from 'vitest';
import { accuracyScore, bestMoveOfReport, pointOfNoReturn, materialDonated, recurrenceIndex, openingClinic, conversionStats } from './advancedCareer.js';

describe('advancedCareer', () => {
  beforeEach(() => localStorage.clear());

  it('calcula accuracy propia de forma monotónica', () => {
    expect(accuracyScore({ analyzedCount: 10, averageLoss: 10 })).toBeGreaterThan(accuracyScore({ analyzedCount: 10, averageLoss: 200 }));
  });

  it('elige la jugada más cercana al motor como jugada de la partida', () => {
    const best = bestMoveOfReport({ moveReports: [{ index: 1, loss: 80, played: 'a4' }, { index: 3, loss: 2, played: 'Nf3' }] });
    expect(best.played).toBe('Nf3');
  });

  it('detecta un punto de no retorno cuando no se recupera la línea sugerida', () => {
    const report = { moveReports: [
      { index: 1, loss: 20, suggestedPerspectiveEval: 40, playedPerspectiveEval: 20 },
      { index: 3, loss: 260, suggestedPerspectiveEval: 320, playedPerspectiveEval: 60 },
      { index: 5, loss: 30, suggestedPerspectiveEval: 90, playedPerspectiveEval: 70 },
    ], worst: { index: 3, loss: 260 } };
    expect(pointOfNoReturn(report)?.index).toBe(3);
  });

  it('suma material perdido por el humano', () => {
    const history = [{ humanColor: 'w', moves: [{ san:'e4' }, { san:'Qxd1', captured:'q' }] }];
    expect(materialDonated(history).points).toBe(9);
  });

  it('mide reincidencia sin inventar incidentes', () => {
    const result = recurrenceIndex({ record:{games:10}, incidents:{'human:MISSED_MATE':3} });
    expect(result.repeated).toBe(2);
    expect(result.score).toBeGreaterThan(0);
  });

  it('marca aperturas repetidas con score bajo para clínica', () => {
    const h = [1,2,3,4].map((_,i)=>({opening:'Italiana',outcome:i===0?'win':'loss',difficulty:50}));
    expect(openingClinic(h)[0].opening).toBe('Italiana');
  });

  it('separa conversión de ventaja y defensa desesperada', () => {
    const c = conversionStats({a:{peakPerspectiveEval:500,troughPerspectiveEval:30,outcome:'loss'},b:{peakPerspectiveEval:350,troughPerspectiveEval:-500,outcome:'win'},c:{peakPerspectiveEval:20,troughPerspectiveEval:-400,outcome:'draw'}});
    expect(c.winningChances).toBe(2); expect(c.converted).toBe(1); expect(c.desperatePositions).toBe(2); expect(c.saved).toBe(2);
  });
});
