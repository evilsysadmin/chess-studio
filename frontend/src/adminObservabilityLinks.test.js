import { describe, expect, it } from 'vitest';
import { GRAFANA_HEALTH_DASHBOARD_URL } from './adminObservabilityLinks.js';

describe('admin observability links', () => {
  it('apunta al dashboard estable de salud de API en Grafana Cloud', () => {
    expect(GRAFANA_HEALTH_DASHBOARD_URL).toBe('https://humbletoucan355.grafana.net/d/chess-studio-api-overview/chess-studio-salud-de-api');
  });
});
