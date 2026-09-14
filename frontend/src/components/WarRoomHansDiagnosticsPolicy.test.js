import { describe, expect, it } from 'vitest';
import { warRoomHansDiagnosticsRequested } from './WarRoomHansDiagnosticsPolicy.js';

describe('War Room Hans diagnostics policy', () => {
  it('preserves the real fireplace quick-iteration request', () => {
    expect(warRoomHansDiagnosticsRequested({ quickIteration: true })).toBe(true);
  });

  it('requires both browser automation and the explicit ambient-audit flag', () => {
    expect(warRoomHansDiagnosticsRequested({ webdriver: true, ambientAudit: true })).toBe(true);
    expect(warRoomHansDiagnosticsRequested({ webdriver: true, ambientAudit: false })).toBe(false);
    expect(warRoomHansDiagnosticsRequested({ webdriver: false, ambientAudit: true })).toBe(false);
    expect(warRoomHansDiagnosticsRequested()).toBe(false);
  });
});
