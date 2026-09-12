const GENRE_PRODUCTION = Object.freeze({
  'SPA / Zen': Object.freeze({ warmth: 0.9, releaseScale: 1.18, space: 0.2, delayMs: 248, mix: { lead: 0.54, counter: 0.34, bass: 0.42, chord: 0.42 } }),
  'Smooth Jazz': Object.freeze({ warmth: 0.92, releaseScale: 1.08, space: 0.12, delayMs: 142, mix: { lead: 0.66, counter: 0.42, bass: 0.9, chord: 0.48 } }),
  'Tropical House': Object.freeze({ warmth: 1.02, releaseScale: 0.84, space: 0.055, delayMs: 86, mix: { lead: 0.66, counter: 0.42, bass: 1.08, chord: 0.6 } }),
  'Energía': Object.freeze({ warmth: 0.96, releaseScale: 0.9, space: 0.055, delayMs: 92, mix: { lead: 0.7, counter: 0.42, bass: 1.02, chord: 0.42 } }),
  'Ecléctica': Object.freeze({ warmth: 0.92, releaseScale: 1.04, space: 0.1, delayMs: 132, mix: { lead: 0.64, counter: 0.4, bass: 0.9, chord: 0.44 } }),
  'Clásica': Object.freeze({ warmth: 0.9, releaseScale: 1.12, space: 0.16, delayMs: 204, mix: { lead: 0.6, counter: 0.42, bass: 0.56, chord: 0.46 } }),
  'Lo-Fi / Chill': Object.freeze({ warmth: 0.82, releaseScale: 1.18, space: 0.1, delayMs: 162, mix: { lead: 0.56, counter: 0.34, bass: 0.86, chord: 0.5 } }),
  'Trip-Hop / Downtempo': Object.freeze({ warmth: 0.84, releaseScale: 1.12, space: 0.14, delayMs: 188, mix: { lead: 0.56, counter: 0.36, bass: 0.98, chord: 0.42 } }),
  'Bossa / Latin Lounge': Object.freeze({ warmth: 0.96, releaseScale: 1.02, space: 0.085, delayMs: 122, mix: { lead: 0.64, counter: 0.4, bass: 0.84, chord: 0.46 } }),
  'Piano / Minimal': Object.freeze({ warmth: 0.86, releaseScale: 1.16, space: 0.14, delayMs: 192, mix: { lead: 0.58, counter: 0.34, bass: 0.5, chord: 0.42 } }),
  'Dark Ambient': Object.freeze({ warmth: 0.76, releaseScale: 1.28, space: 0.22, delayMs: 286, mix: { lead: 0.48, counter: 0.3, bass: 0.74, chord: 0.38 } }),
  'Jazz / Mediterráneo': Object.freeze({ warmth: 0.9, releaseScale: 1.08, space: 0.11, delayMs: 136, mix: { lead: 0.64, counter: 0.4, bass: 0.88, chord: 0.44 } }),
  'Electrónica / Experimental': Object.freeze({ warmth: 0.98, releaseScale: 0.96, space: 0.08, delayMs: 108, mix: { lead: 0.64, counter: 0.42, bass: 1.0, chord: 0.4 } }),
  'Ambient / Otros': Object.freeze({ warmth: 0.88, releaseScale: 1.14, space: 0.16, delayMs: 212, mix: { lead: 0.58, counter: 0.36, bass: 0.68, chord: 0.42 } }),
});

const INSTRUMENT_UPGRADES = Object.freeze({
  'Smooth Jazz': Object.freeze({
    lead: Object.freeze({ guitar2: 'jazzGuitar', epiano: 'rhodesWarm', brass: 'mutedHorn' }),
    counter: Object.freeze({ guitar2: 'jazzGuitar', epiano: 'rhodesWarm', brass: 'mutedHorn' }),
    chord: Object.freeze({ epiano: 'rhodesWarm' }),
    bass: Object.freeze({ bass: 'uprightBass', pizz: 'uprightBass' }),
  }),
  'Jazz / Mediterráneo': Object.freeze({
    lead: Object.freeze({ brass: 'mutedHorn' }),
    counter: Object.freeze({ brass: 'mutedHorn' }),
    chord: Object.freeze({ epiano: 'rhodesWarm' }),
    bass: Object.freeze({ bass: 'uprightBass' }),
  }),
  'Bossa / Latin Lounge': Object.freeze({
    lead: Object.freeze({ guitar2: 'nylonGuitar' }),
    counter: Object.freeze({ guitar2: 'nylonGuitar' }),
    chord: Object.freeze({ epiano: 'rhodesWarm' }),
    bass: Object.freeze({ bass: 'uprightBass' }),
  }),
  'Lo-Fi / Chill': Object.freeze({
    chord: Object.freeze({ epiano: 'rhodesWarm' }),
    bass: Object.freeze({ bass: 'uprightBass' }),
  }),
});

function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function blend(current, target, amount = 0.42) {
  return current + ((target - current) * amount);
}

function upgradedInstrument(theme, feel, lane) {
  const upgrades = INSTRUMENT_UPGRADES[theme?.genre]?.[lane];
  const key = `${lane}Instrument`;
  const current = feel?.[key] || theme?.[key] || null;
  return upgrades?.[current] || current;
}

function premiumPercussion(feel, genre) {
  if (!feel?.percussion) return feel?.percussion;
  if ((feel.percussion.kit || 'legacy') === 'none') return feel.percussion;
  const currentPunch = finiteOr(feel.percussion.punch, 1);
  // Punch extremo suele ser una decisión de arreglo, no un defecto de mezcla:
  // brushes casi ausentes y baterías rock deliberadamente grandes conservan
  // su contraste. Sólo pulimos la zona media para no homogeneizar el catálogo.
  if (currentPunch <= 0.65 || currentPunch >= 1.16) return feel.percussion;
  const targetPunch = genre === 'Energía' || genre === 'Tropical House' ? 1.14 : genre === 'Trip-Hop / Downtempo' ? 1.02 : 0.98;
  return Object.freeze({
    ...feel.percussion,
    punch: clamp(blend(currentPunch, targetPunch, 0.18), 0.62, 1.24),
  });
}

export function withAmbientPremiumProduction(theme, feel) {
  if (!theme || !feel) return feel;
  const target = GENRE_PRODUCTION[theme.genre] || GENRE_PRODUCTION['Ambient / Otros'];
  const currentMix = feel.mix || {};
  const mix = Object.freeze({
    lead: clamp(blend(finiteOr(currentMix.lead, 0.62), target.mix.lead), 0.34, 0.86),
    counter: clamp(blend(finiteOr(currentMix.counter, 0.38), target.mix.counter), 0.22, 0.66),
    bass: clamp(blend(finiteOr(currentMix.bass, 0.84), target.mix.bass), 0.38, 1.16),
    chord: clamp(blend(finiteOr(currentMix.chord, 0.44), target.mix.chord), 0.26, 0.72),
  });

  const result = {
    ...feel,
    warmth: clamp(blend(finiteOr(feel.warmth, 1), target.warmth, 0.38), 0.7, 1.08),
    releaseScale: clamp(blend(finiteOr(feel.releaseScale, 1), target.releaseScale, 0.36), 0.76, 1.36),
    space: clamp(blend(finiteOr(feel.space, 0), target.space, 0.48), 0.035, 0.24),
    delayMs: Math.round(clamp(blend(finiteOr(feel.delayMs, 160), target.delayMs, 0.5), 72, 310)),
    mix,
    percussion: premiumPercussion(feel, theme.genre),
    production: Object.freeze({
      grade: 'premium-v1',
      genre: theme.genre || 'Ambient / Otros',
      intent: theme.genre === 'Energía' || theme.genre === 'Tropical House' ? 'tight-forward' : theme.genre === 'SPA / Zen' || theme.genre === 'Dark Ambient' ? 'deep-wide' : 'warm-controlled',
    }),
  };

  for (const lane of ['lead', 'counter', 'chord', 'bass']) {
    const next = upgradedInstrument(theme, feel, lane);
    if (next) result[`${lane}Instrument`] = next;
  }

  return Object.freeze(result);
}

export { GENRE_PRODUCTION, INSTRUMENT_UPGRADES };
