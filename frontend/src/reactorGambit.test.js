import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';

describe('Synth metal · gambito del reactor', () => {
  it('keeps the published identity while using the new melodic composition', () => {
    const theme = AMBIENT_THEMES.reactorGambit;
    const feel = structuredFeel(theme);
    expect(theme.label).toBe('Synth metal · gambito del reactor');
    expect(theme.stepMs).toBe(120);
    expect(theme.sections).toHaveLength(5);
    expect(theme.description).toContain('melódico');
    expect(feel.family).toBe('synth-metal-reactor-melodic-drive');
    expect(feel.percussion.kit).toBe('legacy');
    expect(feel.percussion.punch).toBeLessThan(1.4);
    expect(feel.layers.signature).toBe(true);
    expect(feel.signature.instrument).toBe('synth');
  });
});
