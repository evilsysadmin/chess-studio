import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStorageItem } from './safeStorage.js';
import { profileStorageIdentityMatchesCurrentUser } from './profileKeys.js';
import { FOOTBALL_STAGING_URL, legacyFootballCareerJson } from './labFootballLink.js';
vi.mock('./safeStorage.js', () => ({ STORAGE_LOCAL: 'localStorage', getStorageItem: vi.fn() }));
vi.mock('./profileKeys.js', () => ({ profileStorageIdentityMatchesCurrentUser: vi.fn() }));
describe('external Football career migration', () => {
 beforeEach(() => { vi.clearAllMocks(); profileStorageIdentityMatchesCurrentUser.mockReturnValue(true); });
 it('exports only the bounded career key without reading other profile data', () => {
  const career = {version:4,clubId:'fc-matthias',seed:1,rounds:[]};
  getStorageItem.mockReturnValue(JSON.stringify(career));
  expect(JSON.parse(legacyFootballCareerJson())).toEqual({application:'football-of-matthias',schema:1,career});
  expect(getStorageItem).toHaveBeenCalledExactlyOnceWith('localStorage','chess-study-football-manager-career-v1');
  expect(FOOTBALL_STAGING_URL).toBe('https://staging.football.shadowops.dpdns.org/');
 });
 it('does not export a mismatched identity or oversized/invalid journal', () => {
  profileStorageIdentityMatchesCurrentUser.mockReturnValue(false);
  expect(legacyFootballCareerJson()).toBeNull();expect(getStorageItem).not.toHaveBeenCalled();
  profileStorageIdentityMatchesCurrentUser.mockReturnValue(true);
  for(const raw of [null,'{broken','{}','x'.repeat(16001)]){getStorageItem.mockReturnValue(raw);expect(legacyFootballCareerJson()).toBeNull();}
 });
});
