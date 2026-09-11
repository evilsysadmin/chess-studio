import { useEffect, useState } from 'react';
import { fetchAdminFeedbackSummary } from './feedback.js';

const REFRESH_MS = 120_000;

export function startVisiblePolling({
  refresh,
  intervalMs = REFRESH_MS,
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

export function useAdminFeedbackInbox({ enabled = false, view = 'menu' } = {}) {
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (!enabled || view !== 'menu') {
      if (!enabled) setNewCount(0);
      return undefined;
    }

    let active = true;
    let controller = null;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const summary = await fetchAdminFeedbackSummary({ signal: controller.signal });
        if (active) setNewCount(Math.max(0, Number(summary?.newCount) || 0));
      } catch (error) {
        // Un fallo transitorio no significa que el inbox esté vacío. Conserva
        // el último recuento confirmado para no hacer desaparecer feedback
        // pendiente por una simple caída de red.
        if (error?.name === 'AbortError' || !active) return;
      }
    };

    const stopPolling = startVisiblePolling({ refresh });

    return () => {
      active = false;
      controller?.abort();
      stopPolling();
    };
  }, [enabled, view]);

  return newCount;
}
