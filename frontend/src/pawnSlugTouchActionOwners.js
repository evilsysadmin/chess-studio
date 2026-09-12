export function createPawnSlugTouchActionOwners() {
  const ownersByAction = new Map();

  return Object.freeze({
    acquire(action, owner) {
      if (!action || owner == null) return false;
      let owners = ownersByAction.get(action);
      if (!owners) {
        owners = new Set();
        ownersByAction.set(action, owners);
      }
      const wasEmpty = owners.size === 0;
      owners.add(owner);
      return wasEmpty;
    },

    release(action, owner) {
      const owners = ownersByAction.get(action);
      if (!owners || owner == null || !owners.delete(owner)) return false;
      if (owners.size > 0) return false;
      ownersByAction.delete(action);
      return true;
    },

    has(action) {
      return Boolean(ownersByAction.get(action)?.size);
    },

    clear() {
      const actions = [...ownersByAction.keys()];
      ownersByAction.clear();
      return actions;
    },
  });
}
