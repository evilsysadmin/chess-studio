import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import {
  FEEDBACK_DRAFT_KEY,
  clearFeedbackDraft,
  readFeedbackDraft,
  saveFeedbackDraft,
} from './feedbackDraft.js';

function installSessionStorage({ blocked = false } = {}) {
  const values = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (key) => {
      if (blocked) throw new DOMException('blocked', 'SecurityError');
      return values.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (blocked) throw new DOMException('blocked', 'SecurityError');
      values.set(key, String(value));
    },
    removeItem: (key) => {
      if (blocked) throw new DOMException('blocked', 'SecurityError');
      values.delete(key);
    },
  });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearStorageMemoryFallback();
});

describe('feedback draft recovery', () => {
  it('restores category and text on the same authenticated tab and context', () => {
    installSessionStorage();
    expect(saveFeedbackDraft({ owner: 'Alice', context: 'Replay', category: 'bug', message: 'Tablero oculto' })).toBe(true);
    expect(readFeedbackDraft({ owner: 'alice', context: 'Replay' })).toEqual({
      category: 'bug', message: 'Tablero oculto',
    });
    expect(readFeedbackDraft({ owner: 'bob', context: 'Replay' })).toBeNull();
    expect(readFeedbackDraft({ owner: 'Alice', context: 'Home' })).toBeNull();
  });

  it('clears only after explicit success and never resurrects the unsent note', () => {
    const native = installSessionStorage();
    saveFeedbackDraft({ owner: 'alice', category: 'ux', message: 'Quiero enviar esto' });
    expect(clearFeedbackDraft()).toBe(true);
    expect(native.has(FEEDBACK_DRAFT_KEY)).toBe(false);
    expect(readFeedbackDraft({ owner: 'alice' })).toBeNull();
  });

  it('does not assert durability when browser storage is blocked', () => {
    installSessionStorage({ blocked: true });
    expect(saveFeedbackDraft({ owner: 'alice', message: 'No perder texto' })).toBe(false);
    expect(readFeedbackDraft({ owner: 'alice' })).toEqual({ category: 'general', message: 'No perder texto' });
    expect(clearFeedbackDraft()).toBe(false);
    expect(readFeedbackDraft({ owner: 'alice' })).toBeNull();
  });

  it('ignores malformed and unrelated session contents', () => {
    const native = installSessionStorage();
    native.set(FEEDBACK_DRAFT_KEY, '{not-json');
    expect(readFeedbackDraft({ owner: 'alice' })).toBeNull();
    native.set(FEEDBACK_DRAFT_KEY, JSON.stringify({ version: 1, owner: 'alice', context: 'Home', category: 'wrong', message: 'Bad' }));
    expect(readFeedbackDraft({ owner: 'alice' })).toBeNull();
    expect(saveFeedbackDraft({ owner: '', message: 'unauthenticated' })).toBe(false);
  });
});
