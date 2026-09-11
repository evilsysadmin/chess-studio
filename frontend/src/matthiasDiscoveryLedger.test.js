import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearMatthiasSessionSignals,
  consumeMatthiasLoginGreeting,
  MATTHIAS_HOME_SESSION_KEY,
  matthiasDiscoveryExposures,
  matthiasDiscoverySessionSeen,
  matthiasHomeSessionSeen,
  markMatthiasHomeSessionSeen,
  queueMatthiasLoginGreeting,
  recordMatthiasDiscoveryExposure,
} from './matthiasSession.js';

describe('Matthias discovery exposure ledger', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearMatthiasSessionSignals();
  });

  it('lets a non-Home proactive exposure suppress a second Home appearance', () => {
    expect(matthiasDiscoverySessionSeen()).toBe(false);
    recordMatthiasDiscoveryExposure('daily', 1000);
    expect(matthiasDiscoveryExposures()).toEqual([{ surface: 'daily', at: 1000 }]);
    expect(matthiasDiscoverySessionSeen()).toBe(true);
    expect(matthiasHomeSessionSeen()).toBe(true);
  });

  it('keeps the historical Home marker while recording the shared exposure', () => {
    markMatthiasHomeSessionSeen(2000);
    expect(sessionStorage.getItem(MATTHIAS_HOME_SESSION_KEY)).toBe('1');
    expect(matthiasDiscoveryExposures()).toEqual([{ surface: 'home', at: 2000 }]);
  });

  it('records login greeting once and explicit re-login clears the previous exposure budget', () => {
    consumeMatthiasLoginGreeting(3000);
    expect(matthiasDiscoveryExposures()).toEqual([{ surface: 'login-greeting', at: 3000 }]);
    expect(matthiasHomeSessionSeen()).toBe(true);

    queueMatthiasLoginGreeting();
    expect(matthiasDiscoveryExposures()).toEqual([]);
    expect(matthiasDiscoverySessionSeen()).toBe(false);
    expect(matthiasHomeSessionSeen()).toBe(false);
  });

  it('bounds exposure history so the session ledger cannot grow forever', () => {
    for (let index = 0; index < 12; index += 1) recordMatthiasDiscoveryExposure(`surface-${index}`, index + 1);
    const rows = matthiasDiscoveryExposures();
    expect(rows).toHaveLength(8);
    expect(rows[0].surface).toBe('surface-4');
    expect(rows.at(-1).surface).toBe('surface-11');
  });
});
