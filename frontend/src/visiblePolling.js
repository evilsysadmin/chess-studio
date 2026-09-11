export function startVisiblePolling({
  refresh,
  intervalMs,
  doc = globalThis.document,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  let timer = null;

  const stopPolling = () => {
    if (timer === null) return;
    clearIntervalFn(timer);
    timer = null;
  };

  const startPolling = () => {
    if (timer !== null || doc?.visibilityState === 'hidden') return;
    timer = setIntervalFn(refresh, intervalMs);
  };

  const onVisibility = () => {
    if (doc?.visibilityState === 'hidden') {
      stopPolling();
      return;
    }
    void refresh();
    startPolling();
  };

  if (doc?.visibilityState !== 'hidden') {
    void refresh();
    startPolling();
  }
  doc?.addEventListener?.('visibilitychange', onVisibility);

  return () => {
    stopPolling();
    doc?.removeEventListener?.('visibilitychange', onVisibility);
  };
}
