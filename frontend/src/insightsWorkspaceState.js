import {
  STORAGE_SESSION,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './safeStorage.js';

export const INSIGHTS_WORKSPACE_STATE_KEY = 'chess-study-insights-workspace-v1';

export function loadInsightsWorkspaceState() {
  const value = readJsonStorage(STORAGE_SESSION, INSIGHTS_WORKSPACE_STATE_KEY, { fallback: {} });
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function rememberInsightsWorkspaceState(next = {}) {
  const current = loadInsightsWorkspaceState();
  return writeJsonStorage(STORAGE_SESSION, INSIGHTS_WORKSPACE_STATE_KEY, {
    ...current,
    ...next,
  });
}

export function clearInsightsWorkspaceState() {
  return removeStorageItem(STORAGE_SESSION, INSIGHTS_WORKSPACE_STATE_KEY);
}
