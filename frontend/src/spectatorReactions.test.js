import { describe, expect, it } from 'vitest';
import { noteworthyPresentation } from './spectatorReactions.js';

describe('spectator reactions', () => {
  it('ignora eventos que no son suficientemente relevantes', () => {
    expect(noteworthyPresentation({ type:'SMALL_THING', priority:30 }, 'human', 4).mode).toBe('silence');
  });

  it('es determinista para el mismo evento y ply', () => {
    const event={ type:'MATE_FOUND', priority:100 };
    const presentation = noteworthyPresentation(event,'human',20);
    expect(presentation).toEqual({
      mode: 'audience',
      cpu: false,
      audience: true,
      matthiasSilence: false,
      text: 'Un par de palmas. Nadie discute el mate.',
    });
    expect(noteworthyPresentation(event,'human',20)).toEqual(presentation);
  });

  it('si activa público entrega una reacción contextual y nunca fuerza a la CPU', () => {
    let found=null;
    for(let ply=0;ply<200;ply+=1){const r=noteworthyPresentation({type:'PAWN_TAKES_QUEEN',priority:85},'human',ply);if(r.audience&&!r.cpu){found=r;break;}}
    expect(found).toBeTruthy();
    expect(found.text).toMatch(/peón|PEÓN|sillas|público/i);
  });

  it('mantiene silencios reales para evitar verbena', () => {
    let silences=0;
    for(let ply=0;ply<100;ply+=1) if(noteworthyPresentation({type:'KNIGHT_FORK',priority:70},'human',ply).mode==='silence') silences+=1;
    expect(silences).toBeGreaterThan(20);
  });
  it('puede responder a una catástrofe humana con silencio deliberado de Matthias', () => {
    let found = null;
    for (let ply = 0; ply < 200; ply += 1) {
      const row = noteworthyPresentation({ type: 'MISSED_MATE', priority: 95 }, 'human', ply);
      if (row.matthiasSilence) { found = row; break; }
    }
    expect(found).toBeTruthy();
    expect(found).toMatchObject({ mode: 'silence', cpu: false, audience: false, matthiasSilence: true, text: null });
  });

});
