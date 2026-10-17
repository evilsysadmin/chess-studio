import { describe, expect, it, vi } from 'vitest';
import {
  CHRONICLES_STANDALONE_DEFAULT_URL,
  chroniclesStandaloneUrl,
  openChroniclesStandalone,
} from './labChroniclesLink.js';

describe('Chronicles standalone link', () => {
  it('points at the dedicated site, Tactics on its hash', () => {
    expect(chroniclesStandaloneUrl('chronicles', {})).toBe(CHRONICLES_STANDALONE_DEFAULT_URL);
    expect(chroniclesStandaloneUrl('chronicles-tactics', {})).toBe(`${CHRONICLES_STANDALONE_DEFAULT_URL}#tactics`);
  });

  it('follows VITE_CHRONICLES_URL and refuses insecure or broken values', () => {
    const env = { VITE_CHRONICLES_URL: 'https://chronicles.shadowops.dpdns.org/#old' };
    expect(chroniclesStandaloneUrl('chronicles', env)).toBe('https://chronicles.shadowops.dpdns.org/');
    expect(chroniclesStandaloneUrl('chronicles-tactics', env)).toBe('https://chronicles.shadowops.dpdns.org/#tactics');
    expect(chroniclesStandaloneUrl('chronicles', { VITE_CHRONICLES_URL: 'http://evil.example/' })).toBe(CHRONICLES_STANDALONE_DEFAULT_URL);
    expect(chroniclesStandaloneUrl('chronicles', { VITE_CHRONICLES_URL: 'not a url' })).toBe(CHRONICLES_STANDALONE_DEFAULT_URL);
  });

  it('opens a new tab, or navigates this one when the tab is blocked', () => {
    const opened = { opener: 'chess-studio' };
    const tab = { open: vi.fn(() => opened), location: { assign: vi.fn() } };
    openChroniclesStandalone('chronicles', { env: {}, win: tab });
    expect(tab.open).toHaveBeenCalledWith(CHRONICLES_STANDALONE_DEFAULT_URL, '_blank');
    expect(opened.opener).toBeNull();
    expect(tab.location.assign).not.toHaveBeenCalled();

    const blocked = { open: vi.fn(() => null), location: { assign: vi.fn() } };
    openChroniclesStandalone('chronicles-tactics', { env: {}, win: blocked });
    expect(blocked.location.assign).toHaveBeenCalledWith(`${CHRONICLES_STANDALONE_DEFAULT_URL}#tactics`);
  });
});
