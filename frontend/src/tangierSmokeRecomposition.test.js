import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES, AMBIENT_THEME_OPTIONS } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { TANGIER_SMOKE_RECOMPOSITION } from './ambientRadioMatthiasRecompositions.js';
import { RADIO_PREMIUM_FORM_SPECS } from './ambientRadioPremiumForms.js';

describe('Tánger · humo · recomposición', () => {
  it('conserva nombre e id publicados mientras expande la recomposición a una forma premium', () => {
    const theme = AMBIENT_THEMES.tangierSmoke;
    const form = RADIO_PREMIUM_FORM_SPECS.tangierSmoke;
    expect(theme.id).toBe('tangierSmoke');
    expect(theme.label).toBe('Tánger · humo');
    expect(theme.label).toBe(TANGIER_SMOKE_RECOMPOSITION.label);
    expect(theme.longFormMs).toBeGreaterThanOrEqual(440000);
    expect(theme.sections).toHaveLength(form.length);
    expect(theme.premiumFormVersion).toBe(1);
    expect(theme.premiumFormScenes).toEqual(form.map((scene) => scene.name));
    expect(theme.leadInstrument).toBe('clarinet');
    expect(theme.counterInstrument).toBe('guitar2');
    expect(theme.chordInstrument).toBe('rhodesWarm');
    expect(theme.bassInstrument).toBe('uprightBass');
  });

  it('publica la nueva descripción y usa un perfil after-hours propio', () => {
    const option = AMBIENT_THEME_OPTIONS.find((entry) => entry.id === 'tangierSmoke');
    const profile = structuredFeel(AMBIENT_THEMES.tangierSmoke);
    expect(option?.label).toBe('Tánger · humo');
    expect(option?.description).toContain('Clarinete seco');
    expect(profile?.family).toBe('tangier-clarinet-guitar-afterhours-v2');
    expect(profile?.layers?.lead).toBe(true);
    expect(profile?.layers?.counter).toBe(true);
    expect(profile?.layers?.chords).toBe(true);
    expect(profile?.percussion?.kit).toBe('maghreb-hand');
  });
});
