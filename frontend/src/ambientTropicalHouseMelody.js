// Melodía dedicada para Tropical House.
// El groove de la familia vive en ambientProfiles.js; aquí sólo escribimos
// frases originales con más vocabulario de alturas y pregunta/respuesta.
// Nada de aleatoriedad: cada sección tiene una melodía estable y reconocible.

function frozenMelody(lead, counter) {
  return Object.freeze({
    lead: Object.freeze(lead),
    counter: Object.freeze(counter),
  });
}

export const TROPICAL_HOUSE_MELODY_REWRITES = Object.freeze({
  palmsAtDusk: Object.freeze({
    description: 'Tropical house luminoso de marimba y nylon: hook amplio, frases que respiran y respuesta sincopada sobre un four-on-the-floor con bastante más vida.',
    melodySections: Object.freeze([
      frozenMelody(
        {0:72,3:74,7:76,11:79,15:77,19:76,23:72,27:69,31:72,35:74,39:81,43:79,47:76,51:74,56:71,61:72},
        {5:64,13:67,21:69,29:71,37:67,45:66,53:69,60:72},
      ),
      frozenMelody(
        {1:74,5:77,9:79,13:81,18:79,22:76,26:74,30:71,34:72,38:76,42:83,46:81,50:77,54:74,58:72,62:69},
        {3:67,11:71,19:72,27:69,35:64,43:67,51:71,59:74},
      ),
      frozenMelody(
        {2:69,7:72,12:74,17:76,22:74,27:71,32:69,37:67,42:72,47:76,52:79,57:74,62:72},
        {5:62,15:66,25:69,35:67,45:64,55:67,61:69},
      ),
    ]),
  }),

  islandKnight: Object.freeze({
    description: 'Tropical house de nylon al frente y marimba de respuesta: riff sincopado, frases ascendentes y pequeñas caídas melódicas para que el tema avance de verdad.',
    melodySections: Object.freeze([
      frozenMelody(
        {1:67,5:71,9:74,13:76,17:74,21:71,25:69,29:67,33:64,37:67,41:72,45:76,49:79,53:76,57:72,61:69},
        {3:79,11:83,19:81,27:76,35:78,43:81,51:84,59:79},
      ),
      frozenMelody(
        {2:69,6:72,10:76,14:79,18:76,22:74,26:71,30:69,34:67,38:71,42:74,46:81,50:79,54:76,58:72,62:67},
        {4:81,12:84,20:79,28:76,36:83,44:81,52:77,60:74},
      ),
      frozenMelody(
        {0:64,5:67,10:71,15:74,20:72,25:69,30:67,35:64,40:69,45:72,50:76,55:71,60:67},
        {8:76,18:79,28:74,38:77,48:81,58:76},
      ),
    ]),
  }),

  bishopSunset: Object.freeze({
    description: 'Tropical house de nylon y marimba con melodía principal cantable: más notas de paso, más rango y un hook ascendente que responde sin caer en una plantilla pop.',
    melodySections: Object.freeze([
      frozenMelody(
        {1:67,5:69,9:71,13:74,17:76,21:74,25:71,29:69,33:67,37:72,41:76,45:79,49:76,53:74,57:71,61:69},
        {3:79,11:83,19:81,27:78,35:81,43:84,51:79,59:76},
      ),
      frozenMelody(
        {2:71,6:74,10:76,14:79,18:81,22:79,26:76,30:72,34:74,38:79,42:83,46:81,50:77,54:74,58:72,62:69},
        {4:83,12:86,20:81,28:79,36:84,44:83,52:79,60:76},
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
      const melody = rewrite.melodySections[index];
      return melody ? { ...section, lead: melody.lead, counter: melody.counter } : section;
    });
    theme.description = rewrite.description;

    const option = options.find((entry) => entry.id === id);
    if (option) option.description = rewrite.description;
  }
}
