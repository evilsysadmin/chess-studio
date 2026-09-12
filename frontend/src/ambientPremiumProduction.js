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

const PERFORMANCE_FINISH = Object.freeze({
  'Smooth Jazz': Object.freeze({ swing: 0.11, signatureVolume: 0.27, signatureDuration: 4.2 }),
  'Bossa / Latin Lounge': Object.freeze({ swing: 0.18, signatureVolume: 0.25, signatureDuration: 3.4 }),
  'Lo-Fi / Chill': Object.freeze({ swing: 0.14, signatureVolume: 0.23, signatureDuration: 4.0 }),
  'Trip-Hop / Downtempo': Object.freeze({ swing: 0.09, signatureVolume: 0.24, signatureDuration: 4.3 }),
  'Jazz / Mediterráneo': Object.freeze({ swing: 0.085, signatureVolume: 0.28, signatureDuration: 4.1 }),
  'SPA / Zen': Object.freeze({ signatureVolume: 0.20, signatureDuration: 4.8 }),
  'Clásica': Object.freeze({ signatureVolume: 0.24, signatureDuration: 4.5 }),
  'Piano / Minimal': Object.freeze({ signatureVolume: 0.22, signatureDuration: 4.6 }),
  'Dark Ambient': Object.freeze({ signatureVolume: 0.18, signatureDuration: 5.0 }),
  'Tropical House': Object.freeze({ signatureVolume: 0.24, signatureDuration: 3.0 }),
  'Energía': Object.freeze({ signatureVolume: 0.22, signatureDuration: 2.8 }),
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
  'Trip-Hop / Downtempo': Object.freeze({
    // El trip-hop nocturno del catálogo ya describe camas de Rhodes en varias
    // piezas legacy. Si aún llega un EP genérico, lo calentamos sin tocar los
    // bajos sintéticos, pads ni metales apagados que definen el noir.
    chord: Object.freeze({ epiano: 'rhodesWarm' }),
  }),
});

const THEME_INSTRUMENT_UPGRADES = Object.freeze({
  pawnMarshal: Object.freeze({
    // La marcha pide "metales contenidos": una trompa apagada mantiene el gesto
    // marcial sin el filo de preset del brass genérico. El resto del arreglo se
    // conserva intacto para que siga sonando inequívocamente a Matthias.
    lead: Object.freeze({ brass: 'mutedHorn' }),
  }),
});

const EXPANSIVE_SPACE_GENRES = new Set(['SPA / Zen', 'Dark Ambient', 'Ambient / Otros']);
const SUSTAIN_RICH_GENRES = new Set(['SPA / Zen', 'Clásica', 'Piano / Minimal', 'Dark Ambient', 'Ambient / Otros']);
const SPARSE_MIX_CEILINGS = Object.freeze({ lead: 0.46, counter: 0.28, bass: 0.56, chord: 0.34 });

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
  const themeUpgrades = THEME_INSTRUMENT_UPGRADES[theme?.id]?.[lane];
  const genreUpgrades = INSTRUMENT_UPGRADES[theme?.genre]?.[lane];
  const key = `${lane}Instrument`;
  const current = feel?.[key] || theme?.[key] || null;
  return themeUpgrades?.[current] || genreUpgrades?.[current] || current;
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

function premiumSwing(feel, genre) {
  const target = PERFORMANCE_FINISH[genre]?.swing;
  if (!Number.isFinite(target)) return finiteOr(feel?.swing, 0);
  const current = finiteOr(feel?.swing, 0);
  // Un swing fuerte suele ser identidad escrita (bossa, shuffle, jazz lento).
  // El acabado sólo da bolsillo a patrones demasiado rectos o rígidos.
  if (Math.abs(current) >= 0.16) return current;
  return clamp(blend(current, target, 0.22), 0, 0.22);
}

function premiumSpace(feel, genre, targetSpace) {
  const current = finiteOr(feel?.space, 0);
  // El delay wet del motor ya satura de forma útil alrededor de .30. Las piezas
  // escritas como espacios grandes (onsen, dark ambient, cámaras ambientales)
  // pueden conservar esa profundidad hasta ese límite; recortarlas a .24 hacía
  // que el mastering premium, paradójicamente, sonara más plano que el arreglo.
  if (EXPANSIVE_SPACE_GENRES.has(genre) && current >= 0.28) {
    return clamp(current, 0.035, 0.30);
  }
  return clamp(blend(current, targetSpace, 0.48), 0.035, 0.30);
}

function premiumRelease(feel, genre, targetRelease) {
  const current = finiteOr(feel?.releaseScale, 1);
  // En piano minimal, cámara, zen y dark ambient una cola larga es parte de la
  // escritura: Four Squares llega a 1.60 y Endgame Adagio a 1.72. El mastering
  // no debe convertir sostenidos de cámara en notas recortadas. Reservamos este
  // techo largo sólo a familias que viven de sustain; los géneros rítmicos
  // conservan el techo anterior y siguen secos/precisos.
  if (SUSTAIN_RICH_GENRES.has(genre) && current >= 1.45) {
    return clamp(current, 0.76, 1.75);
  }
  return clamp(blend(current, targetRelease, 0.36), 0.76, 1.36);
}

function premiumMixValue(current, target, genre, lane, min, max) {
  const value = finiteOr(current, target);
  // En familias de sustain, un fader muy bajo es parte de la orquestación: una
  // segunda voz a .22 o una cama a .30 no son un error de mastering. Evitamos
  // levantarlas hacia el promedio de género; las mezclas normales/calientes sí
  // reciben el polish habitual. Así se conserva profundidad sin engordar barro.
  if (SUSTAIN_RICH_GENRES.has(genre) && value <= SPARSE_MIX_CEILINGS[lane]) {
    return clamp(value, min, max);
  }
  return clamp(blend(value, target), min, max);
}

function premiumSignature(feel, genre) {
  const signature = feel?.signature;
  const target = PERFORMANCE_FINISH[genre];
  if (!signature || !target || !signature.motif || !Object.keys(signature.motif).length) return signature;

  const currentVolume = finiteOr(signature.volume, target.signatureVolume ?? 0.24);
  const currentDuration = finiteOr(signature.durationSteps, target.signatureDuration ?? 4);
  // Una firma que ya llega deliberadamente en segundo plano (<= .22) no se
  // promociona a hook principal durante el mastering. Puede respirar algo más,
  // pero conserva su presencia escrita. Es el equivalente musical de no subir
  // al mayordomo encima de la mesa sólo porque hemos comprado mejores focos.
  const preserveSparseVolume = currentVolume <= 0.22;
  const nextVolume = !preserveSparseVolume && Number.isFinite(target.signatureVolume)
    ? clamp(blend(currentVolume, target.signatureVolume, 0.30), 0.14, 0.36)
    : currentVolume;
  const nextDuration = Number.isFinite(target.signatureDuration)
    ? clamp(blend(currentDuration, target.signatureDuration, 0.24), 2.2, 5.2)
    : currentDuration;

  if (nextVolume === currentVolume && nextDuration === currentDuration) return signature;
  return Object.freeze({
    ...signature,
    volume: nextVolume,
    durationSteps: nextDuration,
  });
}

export function withAmbientPremiumProduction(theme, feel) {
  if (!theme || !feel) return feel;
  const target = GENRE_PRODUCTION[theme.genre] || GENRE_PRODUCTION['Ambient / Otros'];
  const currentMix = feel.mix || {};
  const mix = Object.freeze({
    lead: premiumMixValue(currentMix.lead, target.mix.lead, theme.genre, 'lead', 0.34, 0.86),
    counter: premiumMixValue(currentMix.counter, target.mix.counter, theme.genre, 'counter', 0.22, 0.66),
    bass: premiumMixValue(currentMix.bass, target.mix.bass, theme.genre, 'bass', 0.38, 1.16),
    chord: premiumMixValue(currentMix.chord, target.mix.chord, theme.genre, 'chord', 0.26, 0.72),
  });
  const signature = premiumSignature(feel, theme.genre);

  const result = {
    ...feel,
    swing: premiumSwing(feel, theme.genre),
    warmth: clamp(blend(finiteOr(feel.warmth, 1), target.warmth, 0.38), 0.7, 1.08),
    releaseScale: premiumRelease(feel, theme.genre, target.releaseScale),
    space: premiumSpace(feel, theme.genre, target.space),
    delayMs: Math.round(clamp(blend(finiteOr(feel.delayMs, 160), target.delayMs, 0.5), 72, 310)),
    mix,
    percussion: premiumPercussion(feel, theme.genre),
    ...(signature ? { signature } : {}),
    production: Object.freeze({
      grade: 'premium-v1',
      performance: 'articulation-v1',
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

export { GENRE_PRODUCTION, INSTRUMENT_UPGRADES, PERFORMANCE_FINISH, THEME_INSTRUMENT_UPGRADES };
