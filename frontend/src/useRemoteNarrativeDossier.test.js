import { describe, expect, it } from 'vitest';
import { remoteNarrativeDossierKey } from './useRemoteNarrativeDossier.js';

describe('remoteNarrativeDossierKey', () => {
  const base = {
    eventType: 'combat_briefing',
    requestKind: 'default',
    tone: 'friendly_sarcastic',
    facts: { threat: 'high', credits: 120 },
  };

  it('tracks every field that narrativeRemote sends to the provider', () => {
    const key = remoteNarrativeDossierKey(base);

    expect(remoteNarrativeDossierKey({ ...base, eventType: 'combat_debrief' })).not.toBe(key);
    expect(remoteNarrativeDossierKey({ ...base, requestKind: 'manual' })).not.toBe(key);
    expect(remoteNarrativeDossierKey({ ...base, tone: 'dry' })).not.toBe(key);
    expect(remoteNarrativeDossierKey({ ...base, facts: { ...base.facts, credits: 121 } })).not.toBe(key);
  });

  it('ignores top-level fields that are not part of the remote narrative payload', () => {
    expect(remoteNarrativeDossierKey({ ...base, uiOnly: 'one' }))
      .toBe(remoteNarrativeDossierKey({ ...base, uiOnly: 'two' }));
  });

  it('normalizes missing dossiers and non-object facts', () => {
    expect(remoteNarrativeDossierKey(null)).toBe('null');
    expect(remoteNarrativeDossierKey({ eventType: 'generic', facts: null }))
      .toBe(remoteNarrativeDossierKey({ eventType: 'generic', facts: {} }));
  });
});
