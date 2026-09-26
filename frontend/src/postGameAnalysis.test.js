import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeCompletedGameOnce, clearPostGameAnalysisCache, getCompletedPostGameAnalysis } from './postGameAnalysis.js';

beforeEach(() => clearPostGameAnalysisCache());

describe('post-game shared analysis', () => {
  it('deduplica análisis simultáneos y revisa todo el historial', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const analyze = vi.fn(async (_history, _color, _api, options) => {
      await gate;
      return { analyzedCount: 3, moveReports: [], options };
    });
    const args = { gameId: 'g1', history: [{}, {}, {}, {}, {}, {}], humanColor: 'w', api: {}, analyze };
    const first = analyzeCompletedGameOnce(args);
    const second = analyzeCompletedGameOnce(args);
    expect(analyze).toHaveBeenCalledTimes(1);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(a.options.maxMoves).toBe(6);
    expect(getCompletedPostGameAnalysis('g1')).toBe(a);
  });

  it('reutiliza el informe terminado sin recalcular', async () => {
    const analyze = vi.fn(async () => ({ analyzedCount: 1, moveReports: [] }));
    await analyzeCompletedGameOnce({ gameId: 'g2', history: [{}], humanColor: 'w', api: {}, analyze });
    await analyzeCompletedGameOnce({ gameId: 'g2', history: [{}], humanColor: 'w', api: {}, analyze });
    expect(analyze).toHaveBeenCalledTimes(1);
  });
});
