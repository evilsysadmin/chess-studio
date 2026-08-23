import React, { useEffect, useState } from 'react';
import { fetchLiveStatus } from '../auth.js';

const POLL_MS = 30_000;

export default function LiveServiceStatus({ isAdminUser = false, onAdmin = null }) {
  const [status, setStatus] = useState({ backend: 'checking', onlineUsers: null, presenceAvailable: false, latencyMs: null });

  useEffect(() => {
    let active = true;
    let timer;

    const refresh = async () => {
      const next = await fetchLiveStatus();
      if (!active) return;
      setStatus(next);
      timer = window.setTimeout(refresh, POLL_MS);
    };

    refresh();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const backendUp = status.backend === 'up';
  const checking = status.backend === 'checking';
  const onlineLabel = Number.isInteger(status.onlineUsers)
    ? `${status.onlineUsers} usuarios online`
    : '— usuarios online';
  const latency = backendUp && Number.isInteger(status.latencyMs) ? ` · ${status.latencyMs} ms` : '';
  const backendLabel = checking ? 'Backend …' : `Backend ${backendUp ? 'UP' : 'DOWN'}${latency}`;
  const canOpenAdmin = isAdminUser && typeof onAdmin === 'function';

  return (
    <aside className={`live-service-status ${backendUp ? 'is-up' : checking ? 'is-checking' : 'is-down'}`} aria-live="polite" title="Usuarios activos en los últimos 90 segundos">
      <span className="live-service-dot" aria-hidden="true" />
      {canOpenAdmin ? (
        <button type="button" className="live-service-online-link" onClick={onAdmin} title="Abrir Panel de admin">
          {onlineLabel}
        </button>
      ) : (
        <span>{onlineLabel}</span>
      )}
      <span className="live-service-separator" aria-hidden="true">·</span>
      <strong>{backendLabel}</strong>
    </aside>
  );
}
