import { describe, expect, it } from 'vitest';
import { MAX_VIEW_HISTORY, appendViewHistory, popPreviousView } from './useViewNavigation.js';

describe('view navigation helpers', () => {
  it('limita el back-stack para que una sesión larga no crezca sin límite', () => {
    const history = Array.from({ length: MAX_VIEW_HISTORY }, (_, index) => `view-${index}`);
    const next = appendViewHistory(history, 'history');
    expect(next).toHaveLength(MAX_VIEW_HISTORY);
    expect(next[0]).toBe('view-1');
    expect(next.at(-1)).toBe('history');
  });

  it('vuelve a la vista anterior distinta de la actual', () => {
    expect(popPreviousView(['menu', 'history', 'history'], 'history')).toEqual({
      previous: 'menu',
      history: [],
    });
  });

  it('cae al menú cuando no hay una vista anterior válida', () => {
    expect(popPreviousView([], 'tutorial')).toEqual({ previous: 'menu', history: [] });
  });
});
