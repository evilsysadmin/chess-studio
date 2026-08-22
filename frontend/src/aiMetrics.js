function apiBase() {
  return String(import.meta.env?.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
}

export async function fetchAiNarrativeMetrics({ token, fetchImpl = fetch } = {}) {
  if (!token) return null;
  try {
    const response = await fetchImpl(`${apiBase()}/admin/ai-metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (!body || typeof body !== 'object') return null;
    const circuit = body.circuit && typeof body.circuit === 'object' ? body.circuit : {};
    return {
      samples: Number(body.samples || 0),
      cloudflarePercent: body.cloudflare_percent == null ? null : Number(body.cloudflare_percent),
      fallbackPercent: body.fallback_percent == null ? null : Number(body.fallback_percent),
      p95Ms: body.cloudflare_p95_ms == null ? null : Number(body.cloudflare_p95_ms),
      reasons: body.reasons && typeof body.reasons === 'object' ? body.reasons : {},
      lastEventAt: body.last_event_at == null ? null : Number(body.last_event_at),
      enabled: body.enabled !== false,
      circuit: {
        open: circuit.open === true,
        secondsRemaining: Number(circuit.seconds_remaining || 0),
        consecutiveFailures: Number(circuit.consecutive_failures || 0),
        openCount: Number(circuit.open_count || 0),
        halfOpen: circuit.half_open === true,
        failureThreshold: Number(circuit.failure_threshold || 0),
      },
    };
  } catch {
    return null;
  }
}

export function formatAiMetric(value, suffix = '') {
  return value == null || Number.isNaN(Number(value)) ? '—' : `${Number(value).toLocaleString('es-ES')}${suffix}`;
}

export function aiNarrativeStatus(metrics) {
  if (!metrics) return 'Sin datos';
  if (!metrics.enabled) return 'Desactivado';
  if (metrics.circuit?.open) return 'Circuito abierto';
  return 'Operativo';
}
