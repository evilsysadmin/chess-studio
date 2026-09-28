import { describe, expect, it } from 'vitest';
import {
  reconnectBackoffDelayMs,
  RECONNECT_AUTO_RETRY_LIMIT,
  RECONNECT_BACKOFF_MAX_MS,
} from './gameReconnectBackoff.js';

describe('game reconnect backoff', () => {
  it('crece exponencialmente y queda acotado', () => {
    const midpoint = () => 0.5;
    expect(reconnectBackoffDelayMs(0, { random: midpoint })).toBe(1000);
    expect(reconnectBackoffDelayMs(1, { random: midpoint })).toBe(2000);
    expect(reconnectBackoffDelayMs(2, { random: midpoint })).toBe(4000);
    expect(reconnectBackoffDelayMs(8, { random: midpoint })).toBe(RECONNECT_BACKOFF_MAX_MS);
    expect(RECONNECT_AUTO_RETRY_LIMIT).toBeGreaterThanOrEqual(8);
    expect(RECONNECT_AUTO_RETRY_LIMIT).toBeLessThanOrEqual(12);
  });

  it('añade jitter sin salirse del margen previsto', () => {
    expect(reconnectBackoffDelayMs(3, { random: () => 0 })).toBe(6400);
    expect(reconnectBackoffDelayMs(3, { random: () => 1 })).toBe(9600);
  });
});
