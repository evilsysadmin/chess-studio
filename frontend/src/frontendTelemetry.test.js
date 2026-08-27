import { describe, expect, it } from 'vitest';
import { frontendTelemetryPayload, setFrontendTelemetryContext } from './frontendTelemetry.js';

describe('frontend telemetry privacy contract', () => {
  it('keeps only coarse context and error class', () => {
    setFrontendTelemetryContext('Combat Chess / private?');
    const row = frontendTelemetryPayload('frontend_error', { errorName: 'TypeError<script>', message: 'SECRET' });
    expect(row.eventType).toBe('frontend_error');
    expect(row.context).toBe('Combat Chess  private');
    expect(row.errorName).toBe('TypeErrorscript');
    expect(JSON.stringify(row)).not.toContain('SECRET');
  });

  it('accepts only known Web Vitals', () => {
    expect(frontendTelemetryPayload('web_vital', { metricName: 'LCP', value: 1234.5678 })).toMatchObject({ metricName: 'LCP', value: 1234.568 });
    expect(frontendTelemetryPayload('web_vital', { metricName: 'PASSWORD', value: 1 }).metricName).toBeUndefined();
  });
});
