import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from '../safeStorage.js';
import {
  beginChroniclesRun,
  chroniclesMarkSavedRunRemote,
  ensureChroniclesRun,
  finishChroniclesRun,
} from './chroniclesRunIdentity.js';
import {
  CHRONICLES_REFRESH_RESUME_KEY,
  chroniclesClearPlayingRun,
  chroniclesRememberPlayingRun,
  chroniclesShouldResumePlayingRun,
} from './chroniclesRefreshResume.js';

describe('Chronicles first-person reload continuity', () => {
  beforeEach(() => {
    clearStorageMemoryFallback();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('chess-study-auth-username', 'alice');
  });

  it('restores only the playing first-person expedition without minting a new run', () => {
    expect(chroniclesShouldResumePlayingRun('first-person')).toBe(false);
    const runId = beginChroniclesRun('first-person', { entryMapId: 'swordhaven-campaign' });
    expect(chroniclesShouldResumePlayingRun('first-person')).toBe(false);
    expect(chroniclesRememberPlayingRun('first-person', runId)).toBe(true);
    expect(chroniclesShouldResumePlayingRun('first-person')).toBe(true);
    expect(chroniclesShouldResumePlayingRun('tactics')).toBe(false);
    expect(ensureChroniclesRun('first-person')).toBe(runId);
  });

  it('cannot jump to a different active expedition using a stale tab hint', () => {
    const oldId = beginChroniclesRun('first-person');
    chroniclesRememberPlayingRun('first-person', oldId);
    const newId = beginChroniclesRun('first-person');
    expect(newId).not.toBe(oldId);
    expect(chroniclesShouldResumePlayingRun('first-person')).toBe(false);
    chroniclesRememberPlayingRun('first-person', newId);
    expect(chroniclesShouldResumePlayingRun('first-person')).toBe(true);
  });

  it('rebinds the refresh hint when the server confirms its canonical run id', () => {
    const provisionalId = beginChroniclesRun('first-person');
    chroniclesRememberPlayingRun('first-person', provisionalId);
    const confirmedId = 'server-canonical-run';
    expect(chroniclesMarkSavedRunRemote('first-person', provisionalId, confirmedId)).toBe(confirmedId);
    expect(chroniclesShouldResumePlayingRun('first-person')).toBe(false);
    chroniclesRememberPlayingRun('first-person', confirmedId);
    expect(chroniclesShouldResumePlayingRun('first-person')).toBe(true);
  });

  it('fails closed for another user and for malformed or outdated hints', () => {
    const id = beginChroniclesRun('first-person');
    chroniclesRememberPlayingRun('first-person', id);
    localStorage.setItem('chess-study-auth-username', 'bob');
    expect(chroniclesShouldResumePlayingRun('first-person')).toBe(false);
    localStorage.setItem('chess-study-auth-username', 'alice');
    sessionStorage.setItem(CHRONICLES_REFRESH_RESUME_KEY, '{malformed');
    expect(chroniclesShouldResumePlayingRun('first-person')).toBe(false);
    sessionStorage.setItem(CHRONICLES_REFRESH_RESUME_KEY, JSON.stringify({
      version: 2, owner: 'alice', scope: 'first-person', runId: id,
    }));
    expect(chroniclesShouldResumePlayingRun('first-person')).toBe(false);
  });

  it('leaves the expedition book accessible after an intentional exit or a terminal run', () => {
    const id = beginChroniclesRun('first-person');
    chroniclesRememberPlayingRun('first-person', id);
    chroniclesClearPlayingRun();
    expect(chroniclesShouldResumePlayingRun('first-person')).toBe(false);
    chroniclesRememberPlayingRun('first-person', id);
    expect(finishChroniclesRun('first-person', id)).toBe(true);
    expect(chroniclesShouldResumePlayingRun('first-person')).toBe(false);
  });
});
