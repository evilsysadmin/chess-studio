export function createAsyncCommitGuard() {
  let active = true;

  return Object.freeze({
    isActive: () => active,
    commit(callback) {
      if (!active || typeof callback !== 'function') return false;
      callback();
      return true;
    },
    dispose() {
      active = false;
    },
  });
}
