import { describe, expect, it } from 'vitest';
import { pvpHandoffPhase } from './PvpHandoffModal.jsx';

describe('PvP handoff phases', () => {
  it('distinguishes authoritative readiness states', () => {
    expect(pvpHandoffPhase({ status: 'starting', youReady: false, opponentReady: false }, null)).toBe('confirming');
    expect(pvpHandoffPhase({ status: 'starting', youReady: true, opponentReady: false }, null)).toBe('waiting');
    expect(pvpHandoffPhase({ status: 'starting', youReady: true, opponentReady: true }, null)).toBe('ready');
  });

  it('prefers the synchronized countdown once the match is active', () => {
    expect(pvpHandoffPhase({ status: 'active', youReady: true, opponentReady: true }, 4)).toBe('countdown');
  });

  it('falls back safely while an older backend omits readiness fields', () => {
    expect(pvpHandoffPhase({ status: 'starting' }, null)).toBe('syncing');
  });
});
