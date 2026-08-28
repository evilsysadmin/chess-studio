import { useEffect, useState } from 'react';
import { fetchAdminFeedbackSummary } from './feedback.js';

const REFRESH_MS = 120_000;

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
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
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

    void refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, view]);

  return newCount;
}
