// Radio Matthias · formas largas premium.
//
// El motor WebAudio ya tiene timbres, humanización y transporte suficientes.
// Esta capa trabaja la COMPOSICIÓN: toma el material escrito de cada tema y
// construye una forma explícita (intro, diálogo, ruptura, clímax, coda...) sin
// introducir azar ni una segunda máquina de audio. Cada plan es deliberadamente
// distinto para que la pista se reconozca por su dramaturgia, no sólo por el preset.

const LAYERS = Object.freeze(['lead', 'counter', 'chords', 'bass', 'drums']);

function freezeLayer(spec) {
  if (spec === false || spec == null) return spec;
  return Object.freeze({ ...spec });
}

function stage(name, source, layers = {}) {
  return Object.freeze({
    name,
    source,
    ...Object.fromEntries(LAYERS.map((layer) => [layer, freezeLayer(layers[layer])])),
  });
}

function form(...stages) {
  return Object.freeze(stages);
}

const keep = (every = 1, offset = 0, shift = 0, transpose = 0) => Object.freeze({
  every,
  offset,
  shift,
  transpose,
});

// 13 temas modernos + cuatro piezas que el usuario escucha mucho y que habían
// recibido recomposición previa. Los nombres de escena son parte del contrato:
// documentan qué pretende hacer musicalmente cada tramo.
export const RADIO_PREMIUM_FORM_SPECS = Object.freeze({
  zenCourtyard0408: form(
    stage('mist', 0, { lead: keep(2), counter: false, chords: keep(1), bass: keep(1), drums: false }),
    stage('breath', 1, { lead: keep(1), counter: keep(2), chords: keep(1), bass: keep(1), drums: false }),
    stage('still-water', 2, { lead: false, counter: keep(1), chords: keep(2), bass: keep(1), drums: false }),
    stage('first-light', 1, { lead: keep(1, 0, 2, 12), counter: keep(2, 1), chords: keep(1), bass: keep(1), drums: false }),
    stage('empty-courtyard', 0, { lead: keep(3), counter: false, chords: keep(2), bass: keep(1), drums: false }),
  ),
  velvetKnight0237: form(
    stage('empty-club', 0, { lead: keep(2), counter: false, chords: keep(1), bass: keep(1), drums: keep(2) }),
    stage('guitar-table', 0, { lead: keep(1), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('horn-answers', 1, { lead: keep(2), counter: keep(1, 0, 3), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('rhodes-break', 1, { lead: false, counter: false, chords: keep(1), bass: keep(1), drums: keep(2, 1) }),
    stage('last-round', 0, { lead: keep(1, 0, 1), counter: keep(1), chords: keep(2), bass: keep(1), drums: keep(2) }),
    stage('lights-out', 1, { lead: keep(3), counter: keep(2), chords: keep(2), bass: keep(2), drums: false }),
  ),
  bishopSunset: form(
    stage('nylon-intro', 0, { lead: keep(2), counter: keep(2), chords: keep(1), bass: false, drums: false }),
    stage('shore-groove', 0, { lead: keep(1), counter: keep(1), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('marimba-bridge', 1, { lead: false, counter: keep(1, 0, 2), chords: keep(2), bass: keep(1), drums: keep(2, 1) }),
    stage('sunset-lift', 1, { lead: keep(1, 0, 0, 12), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('foam-line', 0, { lead: keep(3), counter: keep(2), chords: keep(2), bass: keep(2), drums: false }),
  ),
  checkEngine: form(
    stage('ignition', 0, { lead: false, counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(2) }),
    stage('cruise', 0, { lead: keep(1), counter: keep(1), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('tunnel', 1, { lead: false, counter: keep(1, 0, 1), chords: keep(2), bass: keep(1), drums: keep(1) }),
    stage('redline', 2, { lead: keep(1, 0, 0, 12), counter: keep(2, 1), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('coast', 1, { lead: keep(3), counter: false, chords: keep(2), bass: keep(1), drums: keep(3) }),
    stage('last-pull', 0, { lead: keep(1), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(1, 0, 2) }),
  ),
  rookAfterHours: form(
    stage('clean-guitar', 0, { lead: keep(2), counter: keep(2), chords: keep(1), bass: keep(2), drums: false }),
    stage('pulse', 0, { lead: keep(1), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(2) }),
    stage('build', 1, { lead: keep(1), counter: keep(1), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('wall', 2, { lead: keep(1, 0, 0, 12), counter: keep(1), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('afterglow', 0, { lead: keep(3), counter: keep(2), chords: keep(2), bass: keep(2), drums: false }),
  ),
  queenChamberPrelude: form(
    stage('harpsichord-alone', 0, { lead: keep(1), counter: false, chords: keep(2), bass: false, drums: false }),
    stage('counterpoint', 0, { lead: keep(1), counter: keep(1), chords: keep(1), bass: keep(2), drums: false }),
    stage('string-room', 1, { lead: keep(2), counter: keep(1), chords: keep(1), bass: keep(1), drums: false }),
    stage('cadenza', 1, { lead: keep(1, 0, 1, 12), counter: false, chords: false, bass: false, drums: false }),
    stage('coda', 0, { lead: keep(3), counter: keep(2), chords: keep(2), bass: keep(2), drums: false }),
  ),
  lofiPawnNotebook: form(
    stage('tape-start', 0, { lead: keep(2), counter: false, chords: keep(1), bass: keep(2), drums: false }),
    stage('pocket', 0, { lead: keep(1), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('erased-bar', 1, { lead: false, counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(3, 1) }),
    stage('pencil-margin', 1, { lead: keep(2, 1, 3), counter: keep(1), chords: keep(2), bass: keep(1), drums: false }),
    stage('rewind', 0, { lead: keep(1, 0, -2), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(2) }),
    stage('tape-tail', 1, { lead: keep(3), counter: false, chords: keep(2), bass: keep(2), drums: false }),
  ),
  wetCastleTape: form(
    stage('rain-window', 0, { lead: false, counter: keep(1), chords: keep(1), bass: keep(2), drums: false }),
    stage('beat-enters', 0, { lead: keep(1), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('basement', 1, { lead: false, counter: keep(1), chords: keep(2), bass: keep(1), drums: keep(1) }),
    stage('storm', 1, { lead: keep(1, 0, 2), counter: keep(1, 0, 0, 12), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('dripping-coda', 0, { lead: keep(3), counter: keep(2), chords: keep(2), bass: keep(2), drums: false }),
  ),
  rookVeranda: form(
    stage('guitar-pickup', 0, { lead: keep(1), counter: false, chords: keep(2), bass: false, drums: false }),
    stage('brush-groove', 0, { lead: keep(1), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('rhodes-reply', 1, { lead: false, counter: keep(1, 0, 2), chords: keep(1), bass: keep(1), drums: keep(2) }),
    stage('walking-veranda', 1, { lead: keep(2), counter: keep(2), chords: keep(2), bass: keep(1, 0, 1), drums: keep(2, 1) }),
    stage('last-table', 0, { lead: keep(3), counter: keep(2), chords: keep(1), bass: keep(2), drums: false }),
  ),
  sixtyFourKeys: form(
    stage('felt-solo', 0, { lead: keep(1), counter: false, chords: keep(2), bass: false, drums: false }),
    stage('cello-answer', 1, { lead: keep(2), counter: keep(1), chords: keep(1), bass: keep(1), drums: false }),
    stage('held-square', 2, { lead: false, counter: keep(1), chords: keep(2), bass: keep(1), drums: false }),
    stage('upper-key', 1, { lead: keep(2, 0, 0, 12), counter: keep(2), chords: keep(1), bass: false, drums: false }),
    stage('sixty-fourth', 0, { lead: keep(3), counter: false, chords: keep(2), bass: keep(2), drums: false }),
  ),
  sevilleLastLamp0248: form(
    stage('last-lamp', 0, { lead: keep(2), counter: false, chords: keep(1), bass: keep(2), drums: false }),
    stage('hand-groove', 0, { lead: keep(1), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('clarinet-dialogue', 1, { lead: keep(2), counter: keep(1, 0, 3), chords: keep(2), bass: keep(1), drums: keep(2) }),
    stage('empty-patio', 2, { lead: false, counter: keep(1), chords: keep(1), bass: keep(2), drums: keep(3, 1) }),
    stage('terrace', 1, { lead: keep(1, 0, 0, 12), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('02-48', 2, { lead: keep(3), counter: keep(2), chords: keep(2), bass: keep(2), drums: false }),
  ),
  bishopCircuit: form(
    stage('boot-grid', 0, { lead: keep(1), counter: false, chords: keep(2), bass: keep(1), drums: keep(2) }),
    stage('cross-pulse', 0, { lead: keep(1, 0, 1), counter: keep(1), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('glass-rupture', 1, { lead: false, counter: keep(1, 0, 3, 12), chords: keep(2), bass: keep(1), drums: keep(3, 1) }),
    stage('asymmetry', 1, { lead: keep(2, 1, 5), counter: keep(2, 0, -3), chords: keep(1), bass: keep(1, 0, 2), drums: keep(2) }),
    stage('overload', 0, { lead: keep(1, 0, 0, 12), counter: keep(1), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('cold-reset', 1, { lead: keep(3), counter: keep(2), chords: keep(2), bass: keep(2), drums: false }),
  ),
  winterBoard: form(
    stage('snowfield', 0, { lead: keep(2), counter: false, chords: keep(1), bass: keep(1), drums: false }),
    stage('flute-air', 1, { lead: keep(2), counter: keep(1), chords: keep(1), bass: keep(1), drums: false }),
    stage('whiteout', 2, { lead: false, counter: keep(2), chords: keep(1), bass: keep(1), drums: false }),
    stage('thaw', 1, { lead: keep(2, 0, 0, 12), counter: keep(1), chords: keep(2), bass: keep(2), drums: false }),
    stage('blue-hour', 0, { lead: keep(3), counter: keep(2), chords: keep(2), bass: keep(2), drums: false }),
  ),
  reactorGambit: form(
    stage('cold-boot', 0, { lead: false, counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(2) }),
    stage('riff', 1, { lead: keep(1), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('reactor-gap', 2, { lead: false, counter: keep(1, 0, 2), chords: keep(2), bass: keep(1), drums: keep(3, 1) }),
    stage('surge', 3, { lead: keep(1, 0, 0, 12), counter: keep(1), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('half-time', 4, { lead: keep(2), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(2) }),
    stage('shutdown', 0, { lead: keep(3), counter: false, chords: keep(2), bass: keep(2), drums: false }),
  ),
  tangierSmoke: form(
    stage('doorway', 0, { lead: keep(2), counter: keep(1), chords: keep(1), bass: false, drums: false }),
    stage('back-room', 1, { lead: keep(1), counter: keep(2), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('clarinet-smoke', 3, { lead: keep(1, 0, 3), counter: keep(2), chords: keep(2), bass: keep(1), drums: keep(2) }),
    stage('alley', 2, { lead: false, counter: keep(1, 0, -2), chords: keep(1), bass: keep(1), drums: keep(3, 1) }),
    stage('late-set', 0, { lead: keep(1), counter: keep(1), chords: keep(1), bass: keep(1), drums: keep(1) }),
    stage('dawn-cigarette', 2, { lead: keep(3), counter: keep(2), chords: keep(2), bass: keep(2), drums: false }),
  ),
  granadaPatio: form(
    stage('stone-and-nylon', 0, { lead: keep(1), counter: false, chords: keep(1), bass: false, drums: false }),
    stage('qanun-echo', 1, { lead: keep(2), counter: keep(1, 0, 2), chords: keep(2), bass: keep(2), drums: false }),
    stage('chamber', 2, { lead: keep(1), counter: keep(2), chords: keep(1), bass: keep(1), drums: false }),
    stage('fountain-gap', 1, { lead: false, counter: keep(2), chords: keep(2), bass: keep(1), drums: false }),
    stage('patio-return', 0, { lead: keep(2, 0, -1), counter: keep(2), chords: keep(1), bass: keep(2), drums: false }),
  ),
  granadaCopperRain0232: form(
    stage('copper-rain', 1, { lead: false, counter: keep(2), chords: keep(1), bass: keep(1), drums: false }),
    stage('guitar-drops', 0, { lead: keep(2, 1, 3), counter: false, chords: keep(2), bass: keep(2), drums: false }),
    stage('qanun-roof', 2, { lead: keep(3), counter: keep(1, 0, -2, 12), chords: keep(1), bass: keep(1), drums: false }),
    stage('bronze-silence', 1, { lead: false, counter: false, chords: keep(2), bass: keep(1), drums: false }),
    stage('02-32-return', 0, { lead: keep(1), counter: keep(2), chords: keep(1), bass: keep(2), drums: false }),
  ),
});

export const RADIO_PREMIUM_FORM_THEME_IDS = Object.freeze(Object.keys(RADIO_PREMIUM_FORM_SPECS));

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function transformValue(value, transpose = 0) {
  if (!transpose) return value;
  if (Array.isArray(value)) return value.map((note) => Number(note) + transpose);
  if (Number.isFinite(Number(value))) return Number(value) + transpose;
  return value;
}

function transformLayer(values, spec, stepsPerSection) {
  if (spec === false) return {};
  const entries = Object.entries(values || {})
    .map(([step, value]) => [Number(step), value])
    .filter(([step]) => Number.isFinite(step))
    .sort(([left], [right]) => left - right);
  if (!spec) return Object.fromEntries(entries);

  const every = Math.max(1, Math.floor(Number(spec.every) || 1));
  const offset = positiveModulo(Math.floor(Number(spec.offset) || 0), every);
  const shift = Math.floor(Number(spec.shift) || 0);
  const transpose = Number(spec.transpose) || 0;

  return Object.fromEntries(entries
    .filter((_, index) => index % every === offset)
    .map(([step, value]) => [
      positiveModulo(step + shift, stepsPerSection),
      transformValue(value, transpose),
    ]));
}

export function buildPremiumFormSections(theme, formSpec) {
  const originals = Array.isArray(theme?.sections) ? theme.sections : [];
  if (!originals.length || !Array.isArray(formSpec) || !formSpec.length) return originals;
  const stepsPerSection = Math.max(1, Math.floor(Number(theme.stepsPerSection) || 32));

  return formSpec.map((scene, sceneIndex) => {
    const sourceIndex = positiveModulo(Math.floor(Number(scene.source) || 0), originals.length);
    const source = originals[sourceIndex] || {};
    const shaped = { ...source };
    for (const layer of LAYERS) shaped[layer] = transformLayer(source[layer], scene[layer], stepsPerSection);
    shaped.premiumScene = scene.name || `scene-${sceneIndex + 1}`;
    return shaped;
  });
}

export function installRadioPremiumForms({ themes, options = [] }) {
  for (const [id, formSpec] of Object.entries(RADIO_PREMIUM_FORM_SPECS)) {
    const theme = themes[id];
    if (!theme || theme.engine !== 'structured' || !Array.isArray(theme.sections) || !theme.sections.length) continue;
    if (theme.premiumFormVersion === 1) continue;

    theme.sections = buildPremiumFormSections(theme, formSpec);
    theme.premiumFormVersion = 1;
    theme.premiumFormScenes = formSpec.map((scene) => scene.name);

    const option = options.find((entry) => entry.id === id);
    if (option) option.description = theme.description;
  }
  return RADIO_PREMIUM_FORM_THEME_IDS;
}
