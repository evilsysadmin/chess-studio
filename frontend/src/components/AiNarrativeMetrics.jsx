import { useEffect, useState } from 'react';
import { aiNarrativeStatus, fetchAiNarrativeMetrics, formatAiMetric } from '../aiMetrics.js';

export default function AiNarrativeMetrics({ token }) {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchAiNarrativeMetrics({ token }).then((value) => {
      if (alive) setMetrics(value);
    });
    return () => { alive = false; };
  }, [token]);

  if (!metrics) return null;

  return (
    <section className="admin-ai-metrics" aria-label="Estado del narrador AI">
      <div>
        <strong>Narrador AI</strong>
        <span>{aiNarrativeStatus(metrics)} · {metrics.samples} muestras</span>
      </div>
      <dl>
        <div><dt>Cloudflare</dt><dd>{formatAiMetric(metrics.cloudflarePercent, '%')}</dd></div>
        <div><dt>Fallback</dt><dd>{formatAiMetric(metrics.fallbackPercent, '%')}</dd></div>
        <div><dt>p95</dt><dd>{formatAiMetric(metrics.p95Ms, ' ms')}</dd></div>
        <div><dt>Fallos seguidos</dt><dd>{formatAiMetric(metrics.circuit?.consecutiveFailures)}</dd></div>
      </dl>
      {metrics.circuit?.open ? (
        <small>Reintento automático en ~{formatAiMetric(metrics.circuit.secondsRemaining, ' s')}.</small>
      ) : null}
    </section>
  );
}
