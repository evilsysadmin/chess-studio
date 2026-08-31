import { useEffect, useState } from 'react';
import { fetchLiveStatus } from '../auth.js';

const POLL_MS = 30_000;

export default function LiveServiceStatus({ isAdminUser = false, onAdmin = null }) {
  const [status, setStatus] = useState({ backend: 'checking', onlineUsers: null, presenceAvailable: false, latencyMs: null });

  useEffect(() => {
    let active = true;
    let timer = null;

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clearTimer();
      if (active && document.visibilityState === 'visible') timer = window.setTimeout(refresh, POLL_MS);
    };
    const refresh = async () => {
      if (!active || document.visibilityState === 'hidden') return;
      const next = await fetchLiveStatus();
      if (!active) return;
      setStatus(next);
      schedule();
    };
    const onVisibility = () => {
      clearTimer();
      if (document.visibilityState === 'visible') void refresh();
    };

    void refresh();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const backendUp = status.backend === 'up';
  const checking = status.backend === 'checking';
  const onlineCount = Number.isInteger(status.onlineUsers) ? status.onlineUsers : null;
  const onlineLabel = onlineCount !== null
    ? `${onlineCount} ${onlineCount === 1 ? 'usuario online' : 'usuarios online'}`
    : '— usuarios online';
  const latency = backendUp && Number.isInteger(status.latencyMs) ? ` · ${status.latencyMs} ms` : '';
  const backendLabel = checking ? 'Backend …' : `Backend ${backendUp ? 'UP' : 'DOWN'}${latency}`;
  const compactOnlineLabel = onlineCount !== null ? String(onlineCount) : '—';
  const compactBackendLabel = checking ? '…' : `${backendUp ? 'UP' : 'DOWN'}${latency}`;
  const canOpenAdmin = isAdminUser && typeof onAdmin === 'function';

  // Para un jugador, la ausencia de problemas ya es suficiente información.
  // Admin conserva presencia/latencia; el público sólo ve una incidencia real.
  if (!isAdminUser && (backendUp || checking)) return null;

  return (
    <aside className={`live-service-status ${backendUp ? 'is-up' : checking ? 'is-checking' : 'is-down'}`} aria-live="polite" title="Usuarios activos en los últimos ~2,5 minutos">
      <span className="live-service-dot" aria-hidden="true" />
      {canOpenAdmin ? (
        <button
          type="button"
          className="live-service-online-link"
          onClick={onAdmin}
          title="Abrir Panel de admin"
          aria-label={onlineLabel}
        >
          <span className="live-service-online-full">{onlineLabel}</span>
          <span className="live-service-online-compact" aria-hidden="true">{compactOnlineLabel}</span>
        </button>
      ) : null}
      {canOpenAdmin && <span className="live-service-separator" aria-hidden="true">·</span>}
      <strong>
        <span className="live-service-backend-full">{canOpenAdmin ? backendLabel : 'Conexión no disponible'}</span>
        {canOpenAdmin && <span className="live-service-backend-compact" aria-hidden="true">{compactBackendLabel}</span>}
      </strong>
    </aside>
  );
}
