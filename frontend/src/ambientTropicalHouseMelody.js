// Composición dedicada para Tropical House.
// Además del hook, escribimos el rebote armónico y el bajo: el género deja de
// depender de un preset de marimba y pasa a tener una gramática house audible.
// Todo es original, determinista y deja silencios para que la frase respire.

function freezeLine(line) {
  return Object.freeze({ ...line });
}

function houseChords(progression, offsets = [2, 6, 10, 14]) {
  const line = {};
  progression.forEach((chord, bar) => {
    offsets.forEach((offset) => { line[(bar * 16) + offset] = Object.freeze([...chord]); });
  });
  return freezeLine(line);
}

function houseBass(roots, offsets = [0, 6, 8, 14]) {
  const line = {};
  roots.forEach((root, bar) => {
    offsets.forEach((offset, index) => {
      line[(bar * 16) + offset] = index === 1 ? root + 7 : root;
    });
  });
  return freezeLine(line);
}

function frozenSection(lead, counter, progression, roots, options = {}) {
  return Object.freeze({
    lead: freezeLine(lead),
    counter: freezeLine(counter),
    chords: houseChords(progression, options.chordOffsets),
    bass: houseBass(roots, options.bassOffsets),
  });
}

export const TROPICAL_HOUSE_MELODY_REWRITES = Object.freeze({
  palmsAtDusk: Object.freeze({
    description: 'Beach house soulful: piano luminoso, guitarra de nylon y un estribillo original que contesta al bajo sincopado. Cuatro-al-piso cálido, sin postal de chiringuito.',
    melodySections: Object.freeze([
      frozenSection(
        {2:72,5:74,9:76,14:79,18:76,22:74,27:72,30:69,34:72,38:76,43:81,47:79,54:76,61:72},
        {7:64,15:67,23:69,31:67,39:71,46:69,55:67,63:64},
        [[52,55,59,64],[55,59,62,67],[57,60,64,69],[50,55,59,62]],
        [40,43,45,38],
      ),
      frozenSection(
        {1:74,6:77,10:81,15:79,20:76,23:74,29:72,33:69,37:74,42:77,46:84,50:81,55:79,62:74},
        {4:67,12:71,25:69,31:72,36:64,44:67,52:71,60:69},
        [[55,59,62,67],[57,60,64,69],[52,55,59,64],[50,55,59,62]],
        [43,45,40,38],
      ),
      frozenSection(
        {5:69,10:72,14:74,21:76,27:74,33:71,38:69,45:72,50:79,57:74,62:72},
        {8:64,18:67,28:69,40:67,52:64,60:71},
        [[52,55,59,64],[55,59,62,67],[50,55,59,62],[52,55,59,64]],
        [40,43,38,40],
        { chordOffsets: [2, 10], bassOffsets: [0, 8] },
      ),
    ]),
  }),

  islandKnight: Object.freeze({
    description: 'Tropical house nocturno de pluck cristalino, marimba cálida y bajo elástico: hook cortado, contratiempos de piano y percusión orgánica que sí empuja la pista.',
    melodySections: Object.freeze([
      frozenSection(
        {1:67,4:71,10:74,13:76,18:74,22:71,27:69,31:67,35:64,40:67,43:72,49:76,54:72,59:69},
        {6:79,15:83,24:81,30:76,38:78,47:81,56:76,63:74},
        [[55,59,62,67],[52,55,59,64],[57,60,64,69],[50,55,59,62]],
        [43,40,45,38],
      ),
      frozenSection(
        {2:69,7:72,11:76,14:79,19:76,25:74,28:71,34:69,39:67,42:71,48:74,51:81,57:76,62:72},
        {4:81,12:84,21:79,29:76,36:83,45:81,53:77,60:74},
        [[57,60,64,69],[55,59,62,67],[52,55,59,64],[50,55,59,62]],
        [45,43,40,38],
      ),
      frozenSection(
        {4:64,9:67,15:71,21:74,26:72,32:69,37:67,44:69,50:72,55:71,61:67},
        {7:76,18:79,29:74,41:77,52:81,60:76},
        [[55,59,62,67],[52,55,59,64],[50,55,59,62],[55,59,62,67]],
        [43,40,38,43],
        { chordOffsets: [2, 10], bassOffsets: [0, 8] },
      ),
    ]),
  }),

  bishopSunset: Object.freeze({
    description: 'Tropical house de guitarra protagonista, piano house y textura vocal aérea: una frase cantable sube, se corta y vuelve sobre un groove de playa serio.',
    melodySections: Object.freeze([
      frozenSection(
        {1:67,5:69,8:71,14:74,19:76,23:74,29:71,34:67,39:72,43:76,46:79,52:76,57:74,62:69},
        {3:79,11:83,20:81,27:78,36:81,44:84,53:79,60:76},
        [[55,59,62,67],[52,55,59,64],[57,60,64,69],[50,55,59,62]],
        [43,40,45,38],
      ),
      frozenSection(
        {2:71,6:74,12:76,15:79,21:81,26:79,30:76,35:72,38:74,44:79,49:83,53:81,58:77,63:72},
        {4:83,13:86,22:81,28:79,37:84,45:83,54:79,61:76},
        [[59,62,66,71],[57,60,64,69],[52,55,59,64],[50,55,59,62]],
        [47,45,40,38],
      ),
    ]),
  }),
});

export const TROPICAL_HOUSE_MELODY_IDS = Object.freeze(Object.keys(TROPICAL_HOUSE_MELODY_REWRITES));

export function installTropicalHouseMelodies({ themes, options }) {
  for (const [id, rewrite] of Object.entries(TROPICAL_HOUSE_MELODY_REWRITES)) {
    const theme = themes[id];
    if (!theme || !Array.isArray(theme.sections)) continue;

    theme.sections = theme.sections.map((section, index) => {
      const composition = rewrite.melodySections[index];
      return composition ? { ...section, ...composition } : section;
    });
    theme.description = rewrite.description;

    const option = options.find((entry) => entry.id === id);
    if (option) option.description = rewrite.description;
  }
}
