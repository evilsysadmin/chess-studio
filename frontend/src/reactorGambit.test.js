import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { RADIO_PREMIUM_FORM_SPECS } from './ambientRadioPremiumForms.js';

describe('Synth metal · gambito del reactor', () => {
  it('keeps the published identity while using the new melodic composition and premium form', () => {
    const theme = AMBIENT_THEMES.reactorGambit;
    const feel = structuredFeel(theme);
    const form = RADIO_PREMIUM_FORM_SPECS.reactorGambit;
    expect(theme.label).toBe('Synth metal · gambito del reactor');
    expect(theme.stepMs).toBe(120);
    expect(theme.sections).toHaveLength(form.length);
    expect(theme.premiumFormVersion).toBe(1);
    expect(theme.premiumFormScenes).toEqual(form.map((scene) => scene.name));
    expect(theme.description).toContain('melódico');
    expect(feel.family).toBe('synth-metal-reactor-melodic-drive');
    expect(feel.percussion.kit).toBe('legacy');
    expect(feel.percussion.punch).toBeLessThan(1.4);
    expect(feel.layers.signature).toBe(true);
    expect(feel.signature.instrument).toBe('synth');
  });
});
