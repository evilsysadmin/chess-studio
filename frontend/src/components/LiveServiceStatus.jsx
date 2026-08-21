import React, { useEffect, useState } from 'react';
import { fetchLiveStatus } from '../auth.js';

const POLL_MS = 30_000;

export default function LiveServiceStatus() {
  const [status, setStatus] = useState({ backend: 'checking', onlineUsers: null, presenceAvailable: false });

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
    ? `${status.onlineUsers} online`
    : '— online';
  const backendLabel = checking ? 'Backend …' : `Backend ${backendUp ? 'UP' : 'DOWN'}`;

  return (
    <aside className={`live-service-status ${backendUp ? 'is-up' : checking ? 'is-checking' : 'is-down'}`} aria-live="polite" title="Usuarios activos en los últimos 90 segundos">
      <span className="live-service-dot" aria-hidden="true" />
      <span>{onlineLabel}</span>
      <span className="live-service-separator" aria-hidden="true">·</span>
      <strong>{backendLabel}</strong>
    </aside>
  );
}
