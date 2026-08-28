import { beforeEach, describe, expect, it } from 'vitest';
import {
  MATTHIAS_HOME_COOLDOWN_MS,
  buildMatthiasHomeVisit,
  markMatthiasHomeShown,
  matthiasHomeLastShownAt,
  matthiasHomeSessionSeen,
  shouldShowMatthiasHome,
} from './matthiasHome.js';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('chess-study-auth-username', 'tester');
});

describe('Matthias en Home', () => {
  it('sólo recuerda cagadas que existen realmente en el expediente', () => {
    const generic = buildMatthiasHomeVisit({ rivalry: { record: { incidents: {} } } });
    expect(generic.kind).toBe('generic');
    expect(generic.text).not.toMatch(/mate|dama|horquilla|ahogado/i);

    const remembered = buildMatthiasHomeVisit({ rivalry: { record: { incidents: { 'human:MISSED_MATE': 2 } } } });
    expect(remembered).toMatchObject({ kind: 'incident', action: 'train' });
    expect(remembered.text).toMatch(/2 mates ignorados/i);
  });

  it('prioriza continuar una partida activa sobre sacar una pulla histórica', () => {
    const visit = buildMatthiasHomeVisit({
      hasSavedGame: true,
      rivalry: { record: { incidents: { 'human:QUEEN_EN_PRISE_TO_PAWN': 8 } } },
    });
    expect(visit).toMatchObject({ kind: 'continue', action: 'continue', actionLabel: 'Continuar partida' });
  });

  it('es ocasional: una vez por sesión, cooldown persistente y sin competir con overlays', () => {
    const now = Date.parse('2026-08-28T12:00:00Z');
    expect(shouldShowMatthiasHome({ now, randomValue: 0.2 })).toBe(true);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.9 })).toBe(false);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.2, hasOpenOverlay: true })).toBe(false);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.2, sessionSeen: true })).toBe(false);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.2, lastShownAt: now - MATTHIAS_HOME_COOLDOWN_MS + 1 })).toBe(false);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.2, lastShownAt: now - MATTHIAS_HOME_COOLDOWN_MS - 1 })).toBe(true);
  });

  it('marca sesión y cooldown usando el almacenamiento seguro', () => {
    markMatthiasHomeShown(123456);
    expect(matthiasHomeSessionSeen()).toBe(true);
    expect(matthiasHomeLastShownAt()).toBe(123456);
  });
});
