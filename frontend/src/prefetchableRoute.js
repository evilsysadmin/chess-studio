export function createPrefetchableRoute(loader) {
  let pending = null;

  const load = () => {
    if (!pending) {
      pending = Promise.resolve()
        .then(loader)
        .catch((error) => {
          pending = null;
          throw error;
        });
    }
    return pending;
  };

  const prefetch = async () => {
    try {
      await load();
      return true;
    } catch {
      return false;
    }
  };

  return { load, prefetch };
}
