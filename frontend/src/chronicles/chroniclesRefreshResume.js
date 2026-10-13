import { STORAGE_SESSION, getStorageItem, removeStorageItem, setStorageItem } from '../safeStorage.js';
import { chroniclesListSavedRuns, chroniclesSaveCatalogOwner } from './chroniclesRunIdentity.js';

// A session-only navigation hint, never a second copy of the savegame.
// Mongo remains the source of truth for map, position, party and world state.
export const CHRONICLES_REFRESH_RESUME_KEY = 'chess-study-chronicles-playing-v1';

export function chroniclesRememberPlayingRun(scope, runId) {
  const owner = chroniclesSaveCatalogOwner();
  const id = typeof runId === 'string' ? runId.trim() : '';
  if (!owner || !id || scope !== 'first-person') return false;
  return setStorageItem(STORAGE_SESSION, CHRONICLES_REFRESH_RESUME_KEY, JSON.stringify({
    version: 1, owner, scope, runId: id,
  }));
}

export function chroniclesClearPlayingRun() {
  removeStorageItem(STORAGE_SESSION, CHRONICLES_REFRESH_RESUME_KEY);
}

export function chroniclesShouldResumePlayingRun(scope) {
  if (scope !== 'first-person') return false;
  const owner = chroniclesSaveCatalogOwner();
  if (!owner) return false;
  try {
    const raw = getStorageItem(STORAGE_SESSION, CHRONICLES_REFRESH_RESUME_KEY);
    if (!raw) return false;
    const hint = JSON.parse(raw);
    if (hint?.version !== 1 || hint.owner !== owner || hint.scope !== scope
      || typeof hint.runId !== 'string' || !hint.runId) return false;
    // A stale hint cannot create a new run. Only the currently selected,
    // unfinished expedition may bootstrap and fetch its server checkpoint.
    return chroniclesListSavedRuns(scope).some((save) => save.id === hint.runId && save.active);
  } catch {
    return false;
  }
}
