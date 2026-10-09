import {
  STORAGE_LOCAL,
  getStorageItem,
  setStorageItem,
} from '../safeStorage.js';

const AUTH_USERNAME_KEY = 'chess-study-auth-username';

export const CHRONICLES_RUN_STORAGE_KEY = 'chess-study-chronicles-run-v1';

// Legacy adapter-specific keys remain readable for one-way migration only.
// Runtime ownership is now shared by first-person Chronicles and Tactics.
export const CHRONICLES_TACTICS_RUN_STORAGE_KEY = 'chess-study-chronicles-tactics-run-v2';
export const CHRONICLES_FIRST_PERSON_RUN_STORAGE_KEY = 'chess-study-chronicles-first-person-run-v1';

const LEGACY_RUN_STORAGE_KEYS = Object.freeze({
  tactics: CHRONICLES_TACTICS_RUN_STORAGE_KEY,
  'first-person': CHRONICLES_FIRST_PERSON_RUN_STORAGE_KEY,
});

function legacyStorageKeyFor(scope) {
  const key = LEGACY_RUN_STORAGE_KEYS[String(scope || '').trim()];
  if (!key) throw new Error(`Unknown Chronicles run scope: ${scope}`);
  return key;
}

function currentOwner() {
  return String(getStorageItem(STORAGE_LOCAL, AUTH_USERNAME_KEY) || '').trim().toLowerCase();
}

export function chroniclesSaveCatalogOwner() {
  return currentOwner();
}

function createRunId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    // Fall through to a compact non-cryptographic id; uniqueness is enough here.
  }
  return `chronicles-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStoredRun(storageKey) {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'string' || !parsed.id.trim()) return null;
    const owner = String(parsed.owner || '').trim().toLowerCase();
    if (owner !== currentOwner()) return null;
    // Saved runs without an entry preference remain on their original server route.
  const entryMapId = typeof parsed.entryMapId === 'string'
    && /^[a-z0-9-]{1,64}$/.test(parsed.entryMapId)
    ? parsed.entryMapId : null;
  return { id: parsed.id.trim(), owner, ended: Boolean(parsed.ended), entryMapId, remote: parsed.remote === true, pending: parsed.pending === true };
  } catch {
    return null;
  }
}


export const CHRONICLES_SAVE_CATALOG_KEY = 'chess-study-chronicles-save-catalog-v1';

// This is an index of authoritative server run IDs, never a client-side
// copy of world/checkpoint state. The owner is checked on every read.
function readSaveCatalog() {
  const owner = currentOwner();
  if (!owner) return [];
  try {
    const raw = getStorageItem(STORAGE_LOCAL, CHRONICLES_SAVE_CATALOG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.version !== 1 || parsed.owner !== owner || !Array.isArray(parsed.runs)) return [];
    const seen = new Set();
    return parsed.runs.filter((item) => {
      if (!item || typeof item.id !== 'string' || !item.id.trim()
          || typeof item.title !== 'string' || !item.title.trim()
          || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).map((item) => ({
      id: item.id,
      title: item.title.slice(0, 56),
      entryMapId: typeof item.entryMapId === 'string' ? item.entryMapId : null,
      currentMapId: typeof item.currentMapId === 'string' ? item.currentMapId : null,
      createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0,
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
      remote: item.remote === true,
      pending: item.pending === true,
    }));
  } catch {
    return [];
  }
}

function writeSaveCatalog(runs) {
  return setStorageItem(STORAGE_LOCAL, CHRONICLES_SAVE_CATALOG_KEY, JSON.stringify({
    version: 1, owner: currentOwner(), runs,
  }));
}

function indexActiveRun(run) {
  if (!run || run.ended || !currentOwner()) return;
  const runs = readSaveCatalog();
  if (runs.some((item) => item.id === run.id)) return;
  const now = Date.now();
  const numbered = runs.reduce((highest, item) => {
    const match = /^Expedición (\d+)$/.exec(item.title);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  runs.unshift({
    id: run.id, title: 'Expedición ' + (numbered + 1),
    entryMapId: run.entryMapId || null,
    currentMapId: run.entryMapId || null, createdAt: now, updatedAt: now, remote: false, pending: run.pending === true,
  });
  writeSaveCatalog(runs);
}

function unindexRun(runId) {
  const runs = readSaveCatalog();
  const kept = runs.filter((item) => item.id !== runId);
  if (kept.length !== runs.length) writeSaveCatalog(kept);
}

export function chroniclesListSavedRuns(scope) {
  const current = readRunState(scope); // Migrate pre-catalog active sessions.
  if (current && !current.ended) indexActiveRun(current);
  return readSaveCatalog()
    .map((item) => ({ ...item, active: item.id === current?.id && !current.ended }))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}


function remoteTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}

/** Merge server authority with local display names and not-yet-created slots.
 * Previously confirmed server rows missing from the active list are retired.
 * Failed fetches must not call this method; that preserves the offline cache.
 */
export function chroniclesMergeRemoteSavedRuns(scope, remoteRuns, { expectedOwner = currentOwner() } = {}) {
  legacyStorageKeyFor(scope);
  if (!Array.isArray(remoteRuns)) throw new TypeError('Invalid remote save inventory');
  // Reject an authenticated response for a user who signed out mid-request.
  if (!expectedOwner || expectedOwner !== currentOwner()) return chroniclesListSavedRuns(scope);
  const active = readRunState(scope);
  const previous = readSaveCatalog();
  const byId = new Map(previous.map((row) => [row.id, row]));
  const seen = new Set();
  const incoming = remoteRuns.slice(0, 30).flatMap((row) => {
    const id = typeof row?.runId === 'string' ? row.runId.trim() : '';
    if (!id || seen.has(id) || (row.status && row.status !== 'active')) return [];
    seen.add(id);
    const local = byId.get(id);
    const createdAt = remoteTimestamp(row.createdAt);
    const updatedAt = remoteTimestamp(row.updatedAtMs ?? row.updatedAt);
    return [{
      id,
      title: local?.title || `Expedición ${id.slice(0, 8)}`,
      entryMapId: local?.entryMapId || null,
      currentMapId: typeof row.currentMapId === 'string' ? row.currentMapId : null,
      createdAt: createdAt || local?.createdAt || 0,
      updatedAt: updatedAt || local?.updatedAt || 0,
      remote: true,
      pending: false,
    }];
  });
  // A full 30-row response can hide older server runs: absence then proves
  // nothing. For a shorter complete response, retire removed/terminal rows.
  const complete = remoteRuns.length < 30;
  const pendingLocal = previous.filter((row) => (!row.remote || !complete) && !seen.has(row.id));
  writeSaveCatalog([...incoming, ...pendingLocal]);
  if (active && !active.ended && active.remote && complete && !seen.has(active.id)) {
    writeRunState({ ...active, ended: true });
  } else if (active && !active.ended && seen.has(active.id) && !active.remote) {
    writeRunState({ ...active, remote: true, pending: false });
  }
  return chroniclesListSavedRuns(scope);
}

/** Mark an id as server-persisted once its authoritative bootstrap succeeds. */
export function chroniclesMarkSavedRunRemote(scope, runId) {
  legacyStorageKeyFor(scope);
  const runs = readSaveCatalog();
  const row = runs.find((item) => item.id === runId);
  if (row && (!row.remote || row.pending)) {
    row.remote = true;
    row.pending = false;
    writeSaveCatalog(runs);
  }
  const active = readRunState(scope);
  if (active?.id === runId && (!active.remote || active.pending)) {
    writeRunState({ ...active, remote: true, pending: false });
  }
}

export function chroniclesSelectedRunIsRemote(scope, runId) {
  const active = readRunState(scope);
  // Old local snapshots predate the remote flag. They may already exist in
  // Mongo, so GET them and fail closed on 404 instead of attempting a POST.
  // Only explicitly minted, not-yet-bootstraped runs are safe to create.
  return active?.id === runId && !active.ended && (active.remote === true || !active.pending);
}

export function chroniclesSelectSavedRun(scope, runId) {
  legacyStorageKeyFor(scope);
  const row = readSaveCatalog().find((item) => item.id === runId);
  if (!row) return false;
  writeRunState({
    id: row.id, owner: currentOwner(), ended: false,
    entryMapId: row.entryMapId,
    remote: row.remote === true,
    pending: row.pending === true,
  });
  return true;
}

export function chroniclesRenameSavedRun(scope, runId, title) {
  legacyStorageKeyFor(scope);
  const name = String(title || '').trim().slice(0, 56);
  if (!name) return false;
  const runs = readSaveCatalog();
  const row = runs.find((item) => item.id === runId);
  if (!row) return false;
  row.title = name;
  writeSaveCatalog(runs);
  return true;
}

// Forget removes the device-local pointer only. It deliberately does not
// pretend to delete the server-owned checkpoint or any character progression.
export function chroniclesForgetSavedRun(scope, runId) {
  const current = readRunState(scope);
  const runs = readSaveCatalog();
  if (!runs.some((item) => item.id === runId)) return false;
  unindexRun(runId);
  if (current && current.id === runId) {
    setStorageItem(STORAGE_LOCAL, CHRONICLES_RUN_STORAGE_KEY, JSON.stringify({
      ...current, ended: true,
    }));
  }
  return true;
}

export function chroniclesNoteSavedRunCheckpoint(scope, runId, currentMapId) {
  legacyStorageKeyFor(scope);
  const runs = readSaveCatalog();
  const row = runs.find((item) => item.id === runId);
  if (!row) return false;
  if (typeof currentMapId === 'string' && /^[a-z0-9-]{1,64}$/.test(currentMapId)) {
    row.currentMapId = currentMapId;
  }
  row.updatedAt = Date.now();
  row.remote = true;
  row.pending = false;
  writeSaveCatalog(runs);
  return true;
}

function writeRunState(run) {
  const saved = setStorageItem(STORAGE_LOCAL, CHRONICLES_RUN_STORAGE_KEY, JSON.stringify(run));
  if (run.ended) unindexRun(run.id);
  else indexActiveRun(run);
  return saved;
}

function readRunState(scope) {
  const preferredLegacyKey = legacyStorageKeyFor(scope);
  const shared = readStoredRun(CHRONICLES_RUN_STORAGE_KEY);
  if (shared) {
    if (!shared.ended) indexActiveRun(shared);
    return shared;
  }

  // Migration is intentionally first-entry-wins. If old first-person and
  // Tactics sessions disagree, whichever adapter the player opens first
  // establishes the canonical run; the other adapter then follows it.
  const migrationKeys = [
    preferredLegacyKey,
    ...Object.values(LEGACY_RUN_STORAGE_KEYS).filter((key) => key !== preferredLegacyKey),
  ];
  for (const storageKey of migrationKeys) {
    const legacy = readStoredRun(storageKey);
    if (!legacy || legacy.ended) continue;
    writeRunState(legacy);
    return legacy;
  }
  return null;
}

export function beginChroniclesRun(scope, { entryMapId = null } = {}) {
  // The campaign is opt-in and may only be selected for a *fresh* first-person
  // run. Do not allow callers to mint an unknown map ID or silently redirect
  // Tactics/legacy runs. Existing server checkpoints remain authoritative.
  legacyStorageKeyFor(scope);
  if (entryMapId !== null && (scope !== 'first-person' || entryMapId !== 'swordhaven-campaign')) {
    throw new RangeError('Unsupported Chronicles fresh-run entry map');
  }
  // Do not discard the previous active run when starting a new expedition.
  // Existing run IDs keep their backend checkpoints and stay loadable.
  readRunState(scope);
  // Default is still historical Swordhaven until the new world has passed its
  // end-to-end server/renderer/restore gates and the UI offers explicit entry.
  const run = {
    id: createRunId(), owner: currentOwner(), ended: false,
    entryMapId: scope === 'first-person' ? (entryMapId || 'swordhaven-square') : null,
    pending: true,
  };
  writeRunState(run);
  return run.id;
}

export function chroniclesRunEntryMapId(scope) {
  const run = readRunState(scope);
  return run && !run.ended ? run.entryMapId : null;
}

export function ensureChroniclesRun(scope) {
  const current = readRunState(scope);
  if (current && !current.ended) return current.id;
  return beginChroniclesRun(scope);
}

export function renewChroniclesRun(scope, runId) {
  const current = readRunState(scope);
  if (current && !current.ended && current.id !== runId) return current.id;
  if (current && current.id === runId && !current.ended) {
    writeRunState({ ...current, ended: true });
  }
  // A lost/stale server identity must not silently change an opted-in
  // campaign back to legacy Swordhaven when first-person renews the run.
  const entryMapId = scope === 'first-person' && current?.entryMapId === 'swordhaven-campaign'
    ? current.entryMapId : null;
  return beginChroniclesRun(scope, { entryMapId });
}

export function finishChroniclesRun(scope, runId) {
  const current = readRunState(scope);
  if (!current || current.id !== runId) return false;
  writeRunState({ ...current, ended: true });
  return true;
}
