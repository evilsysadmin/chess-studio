import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { profileStorageIdentityMatchesCurrentUser } from './profileKeys.js';
export const FOOTBALL_STAGING_URL = 'https://staging.football.shadowops.dpdns.org/';
const LEGACY_KEY = 'chess-study-football-manager-career-v1';
// A career-only export. The destination replays and validates its own journal.
// No profile, credentials, arbitrary storage enumeration or source deletion.
export function legacyFootballCareerJson() {
  if (!profileStorageIdentityMatchesCurrentUser()) return null;
  const raw = getStorageItem(STORAGE_LOCAL, LEGACY_KEY);
  if (!raw || raw.length > 16000) return null;
  try {
    const career = JSON.parse(raw);
    if (!career || !Number.isInteger(career.version) || typeof career.clubId !== 'string') return null;
    return JSON.stringify({ application: 'football-of-matthias', schema: 1, career });
  } catch { return null; }
}
export function exportLegacyFootballCareer() {
  const raw = legacyFootballCareerJson();
  if (!raw) return false;
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'football-carrera.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
