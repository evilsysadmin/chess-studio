import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import './ambientProfiles.js';
import {
  RADIO_PREMIUM_FORM_SPECS,
  RADIO_PREMIUM_FORM_THEME_IDS,
  buildPremiumFormSections,
  installRadioPremiumForms,
} from './ambientRadioPremiumForms.js';

function densitySignature(section) {
  return ['lead', 'counter', 'chords', 'bass', 'drums']
    .map((layer) => Object.keys(section?.[layer] || {}).length)
    .join(':');
}

function firstStep(section, layer) {
  const steps = Object.keys(section?.[layer] || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  return steps[0] ?? -1;
}

function formFingerprint(theme) {
  return (theme.sections || []).map((section) => [
    densitySignature(section),
    firstStep(section, 'lead'),
    firstStep(section, 'counter'),
    firstStep(section, 'bass'),
    firstStep(section, 'drums'),
  ].join('@')).join('|');
}

function assertLayerStepsInsideSection(theme) {
  const limit = Number(theme.stepsPerSection) || 32;
  for (const section of theme.sections || []) {
    for (const layer of ['lead', 'counter', 'chords', 'bass', 'drums']) {
      for (const step of Object.keys(section?.[layer] || {}).map(Number)) {
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThan(limit);
      }
    }
  }
}

describe('Radio Matthias · premium long-form arrangements', () => {
  it('installs curated forms on the 17 flagship tracks', () => {
    expect(RADIO_PREMIUM_FORM_THEME_IDS).toHaveLength(17);

    for (const id of RADIO_PREMIUM_FORM_THEME_IDS) {
      const theme = AMBIENT_THEMES[id];
      expect(theme, id).toBeTruthy();
      expect(theme.engine, id).toBe('structured');
      expect(theme.premiumFormVersion, id).toBe(1);
      expect(theme.premiumFormScenes, id).toEqual(RADIO_PREMIUM_FORM_SPECS[id].map((scene) => scene.name));
      expect(theme.sections.length, id).toBeGreaterThanOrEqual(5);
      expect(new Set(theme.sections.map(densitySignature)).size, id).toBeGreaterThanOrEqual(3);
      assertLayerStepsInsideSection(theme);
    }
  });

  it('gives every flagship track a distinct arrangement silhouette', () => {
    const fingerprints = RADIO_PREMIUM_FORM_THEME_IDS.map((id) => formFingerprint(AMBIENT_THEMES[id]));
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('keeps the two Granada pieces in the same timbral family but different formal identities', () => {
    const patio = AMBIENT_THEMES.granadaPatio;
    const copper = AMBIENT_THEMES.granadaCopperRain0232;
    expect(patio.premiumFormScenes).not.toEqual(copper.premiumFormScenes);
    expect(formFingerprint(patio)).not.toBe(formFingerprint(copper));
  });

  it('builds deterministic shifted/transposed scenes without mutating the source material', () => {
    const source = {
      engine: 'structured',
      stepsPerSection: 8,
      sections: [{
        lead: { 0: 60, 2: 62, 4: 64, 6: 65 },
        counter: { 1: 72, 5: 74 },
        chords: { 0: [48, 52, 55] },
        bass: { 0: 36, 4: 38 },
        drums: { 0: 'K', 4: 'S' },
      }],
    };
    const snapshot = JSON.parse(JSON.stringify(source));
    const spec = [{
      name: 'proof', source: 0,
      lead: { every: 2, offset: 1, shift: 3, transpose: 12 },
      counter: false,
      chords: { every: 1, offset: 0, shift: 0, transpose: 5 },
      bass: { every: 1, offset: 0, shift: -1, transpose: 0 },
      drums: { every: 2, offset: 0, shift: 1, transpose: 0 },
    }];

    const first = buildPremiumFormSections(source, spec);
    const second = buildPremiumFormSections(source, spec);
    expect(first).toEqual(second);
    expect(source).toEqual(snapshot);
    expect(first[0].lead).toEqual({ 5: 74, 1: 77 });
    expect(first[0].counter).toEqual({});
    expect(first[0].chords).toEqual({ 0: [53, 57, 60] });
    expect(first[0].bass).toEqual({ 7: 36, 3: 38 });
    expect(first[0].drums).toEqual({ 1: 'K' });
  });

  it('is idempotent when the profile facade is installed more than once', () => {
    const before = Object.fromEntries(RADIO_PREMIUM_FORM_THEME_IDS.map((id) => [id, formFingerprint(AMBIENT_THEMES[id])]));
    installRadioPremiumForms({ themes: AMBIENT_THEMES });
    const after = Object.fromEntries(RADIO_PREMIUM_FORM_THEME_IDS.map((id) => [id, formFingerprint(AMBIENT_THEMES[id])]));
    expect(after).toEqual(before);
  });
});
