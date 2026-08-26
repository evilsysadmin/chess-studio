import { describe, expect, it } from 'vitest';
import { buildCareerHeatmaps, deriveRpgProfile, lastDailyCells, summarizeRpgProfile } from './careerVisuals.js';

describe('career visual data', () => {
  it('counts human activity, captures and real loss squares by mover color', () => {
    const history = [{ humanColor:'w', moves:[
      { from:'e2', to:'e4', piece:'p', san:'e4' },
      { from:'d7', to:'d5', piece:'p', san:'d5' },
      { from:'e4', to:'d5', piece:'p', san:'exd5', captured:'p' },
      { from:'d8', to:'d5', piece:'q', san:'Qxd5', captured:'p' },
    ] }];
    const map = buildCareerHeatmaps(history);
    expect(map.activity.e4).toBe(1);
    expect(map.captures.d5).toBe(1);
    expect(map.losses.d5).toBe(1);
    expect(map.totals.humanLosses).toBe(1);
  });

  it('derives RPG attributes only from measured inputs', () => {
    const history = [{ humanColor:'w', moves:[{san:'e4'},{san:'e5'},{san:'Nf3'},{san:'Nc6'},{san:'O-O'}] }];
    const archive = {
      a:{ accuracy:84, peakPerspectiveEval:350, troughPerspectiveEval:-450, outcome:'win' },
      b:{ accuracy:76, peakPerspectiveEval:400, troughPerspectiveEval:-350, outcome:'loss' },
    };
    const profile = deriveRpgProfile(history, archive, { pressure:{moves:10,incidents:2} });
    const byId = Object.fromEntries(profile.attributes.map((a)=>[a.id,a]));
    expect(byId.precision.value).toBe(80);
    expect(byId.conversion.value).toBe(50);
    expect(byId.resilience.value).toBe(50);
    expect(byId.discipline.value).toBe(80);
    expect(byId.kingSafety.value).toBe(100);
  });


  it('resume el RPG sin abrumar y sólo compara atributos medidos', () => {
    const summary = summarizeRpgProfile({
      title: 'Pulso de hielo', games: 12, leaderId: 'discipline',
      attributes: [
        { id:'precision', label:'Precisión', value:74, sample:6 },
        { id:'discipline', label:'Pulso', value:91, sample:18 },
        { id:'conversion', label:'Conversión', value:null, sample:0 },
        { id:'resilience', label:'Resistencia', value:52, sample:4 },
      ],
    });
    expect(summary).toMatchObject({ title:'Pulso de hielo', games:12, measuredCount:3 });
    expect(summary.leader).toMatchObject({ id:'discipline', value:91 });
    expect(summary.lowest).toMatchObject({ id:'resilience', value:52 });
  });

  it('builds a deterministic 28-day daily grid', () => {
    const cells = lastDailyCells(['2026-08-22'], 28, new Date('2026-08-22T12:00:00'));
    expect(cells).toHaveLength(28);
    expect(cells.at(-1)).toMatchObject({ key:'2026-08-22', solved:true, today:true });
  });
});
