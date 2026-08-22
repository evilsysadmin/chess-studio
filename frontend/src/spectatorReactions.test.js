import { describe, expect, it } from 'vitest';
import { noteworthyPresentation } from './spectatorReactions.js';

describe('spectator reactions', () => {
  it('ignora eventos que no son suficientemente relevantes', () => {
    expect(noteworthyPresentation({ type:'SMALL_THING', priority:30 }, 'human', 4).mode).toBe('silence');
  });

  it('es determinista para el mismo evento y ply', () => {
    const event={ type:'MATE_FOUND', priority:100 };
    expect(noteworthyPresentation(event,'human',20)).toEqual(noteworthyPresentation(event,'human',20));
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
});
