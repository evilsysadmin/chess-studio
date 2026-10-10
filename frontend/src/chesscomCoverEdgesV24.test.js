import { describe,expect,it } from 'vitest';
import { CHESSCOM_COVER_EDGES_V24,chesscomCrateEdgeV24Parts } from './chesscomCoverEdgesV24.js';

describe('CHESSCOM Dust Veil crate silhouettes V24',()=>{
  it('separates low and high cover through physically attached 3D trim',()=>{
    const low=chesscomCrateEdgeV24Parts();
    const high=chesscomCrateEdgeV24Parts({high:true});
    const coarse=chesscomCrateEdgeV24Parts({high:true,coarse:true});
    expect(CHESSCOM_COVER_EDGES_V24.affectsTactics).toBe(false);
    expect(low).toHaveLength(1);
    expect(high).toHaveLength(3);
    expect(coarse).toHaveLength(1);
    expect(high.length).toBeLessThanOrEqual(CHESSCOM_COVER_EDGES_V24.perCrateLimit);
    expect(high[0].y).toBeGreaterThan(low[0].y);
    expect(new Set(high.map(p=>p.name)).size).toBe(high.length);
    for(const part of [...high,...low,...coarse]){
      expect(['metalBright','metal']).toContain(part.finish);
      expect([part.x,part.y,part.z,part.w,part.h,part.d].every(Number.isFinite)).toBe(true);
      expect(Math.min(part.w,part.h,part.d)).toBeGreaterThan(0);
      expect(Math.abs(part.x)+part.w/2).toBeLessThan(.55);
      expect(part.y).toBeGreaterThanOrEqual(0);
      expect(part.y+part.h).toBeLessThanOrEqual(1.06);
    }
  });
});