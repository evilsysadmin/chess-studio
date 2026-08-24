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
      p50Ms: body.cloudflare_p50_ms == null ? null : Number(body.cloudflare_p50_ms),
      p95Ms: body.cloudflare_p95_ms == null ? null : Number(body.cloudflare_p95_ms),
      p99Ms: body.cloudflare_p99_ms == null ? null : Number(body.cloudflare_p99_ms),
      reasons: body.reasons && typeof body.reasons === 'object' ? body.reasons : {},
      eventTypes: body.event_types && typeof body.event_types === 'object' ? body.event_types : {},
      requestKinds: body.request_kinds && typeof body.request_kinds === 'object' ? body.request_kinds : {},
      models: body.models && typeof body.models === 'object' ? body.models : {},
      workerErrors: body.worker_errors && typeof body.worker_errors === 'object' ? body.worker_errors : {},
      channels: body.channels && typeof body.channels === 'object' ? body.channels : {},
      usage: body.usage && typeof body.usage === 'object' ? {
        inputTokens: Number(body.usage.input_tokens || 0),
        outputTokens: Number(body.usage.output_tokens || 0),
        totalTokens: Number(body.usage.total_tokens || 0),
        estimatedNeurons: Number(body.usage.estimated_neurons || 0),
        estimatedCostUsd: Number(body.usage.estimated_cost_usd || 0),
        pricingNote: String(body.usage.pricing_note || ''),
      } : null,
      lastEventAt: body.last_event_at == null ? null : Number(body.last_event_at),
      enabled: body.enabled !== false,
      circuit: {
        open: circuit.open === true,
        secondsRemaining: Number(circuit.seconds_remaining || 0),
        consecutiveFailures: Number(circuit.consecutive_failures || 0),
        openCount: Number(circuit.open_count || 0),
        halfOpen: circuit.half_open === true,
        failureThreshold: Number(circuit.failure_threshold || 0),
        channels: circuit.channels && typeof circuit.channels === 'object' ? circuit.channels : {},
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
