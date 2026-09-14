import { describe, expect, it } from 'vitest';
import { pawnSlugRenderDiagnostics } from './pawnSlugRenderBudget.js';

describe('Pawn Slug local render diagnostics', () => {
  it('reads bounded numeric renderer.info counters without external telemetry', () => {
    expect(pawnSlugRenderDiagnostics({
      info: {
        render: { calls: 57, triangles: 18420, points: 64 },
        memory: { textures: 21, geometries: 38 },
      },
    })).toEqual({
      drawCalls: 57,
      triangles: 18420,
      points: 64,
      textures: 21,
      geometries: 38,
    });
  });

  it('falls back to zero for missing renderer counters', () => {
    expect(pawnSlugRenderDiagnostics(null)).toEqual({
      drawCalls: 0,
      triangles: 0,
      points: 0,
      textures: 0,
      geometries: 0,
    });
  });
});
