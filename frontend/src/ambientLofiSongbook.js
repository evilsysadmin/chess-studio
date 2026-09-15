// Lo-fi still needs a song underneath the dust. These three deterministic
// rewrites give each room a singable motif, a reply and a bass pocket while
// leaving the cassette/brush production to ambientContemplativeProduction.

function frozenSection(lead, counter, bass) {
  return Object.freeze({
    lead: Object.freeze(lead),
    counter: Object.freeze(counter),
    bass: Object.freeze(bass),
  });
}

export const LOFI_SONGBOOK_REWRITES = Object.freeze({
  lofiRainTape: Object.freeze({
    description: 'Lo-fi de cassette con un motivo de piano reconocible, Rhodes en respuesta y una batería ladeada que conserva el pulso bajo la lluvia.',
    melodySections: Object.freeze([
      frozenSection(
        {2:64,6:67,11:71,15:69,18:67,23:64,27:62,31:64,34:67,39:71,43:74,47:71,52:69,58:67,62:64},
        {4:55,12:59,20:57,28:52,36:59,44:62,54:57,60:55},
        {0:40,6:47,8:40,14:43,16:38,22:45,24:38,30:42,32:43,38:50,40:43,46:47,48:41,54:48,56:41,62:45},
      ),
      frozenSection(
        {1:67,5:71,10:74,14:72,19:69,23:67,29:64,33:67,37:69,42:72,46:76,50:74,55:71,59:69,63:67},
        {7:55,15:59,25:62,31:59,39:57,47:60,55:59,61:55},
        {0:43,6:50,8:43,14:47,16:40,22:47,24:40,30:45,32:45,38:52,40:45,46:48,48:38,54:45,56:38,62:43},
      ),
    ]),
  }),
  lofiWindowLight: Object.freeze({
    description: 'Lo-fi nocturno con hook de vibráfono, guitarra de nylon a contratiempo y un beat cálido que avanza sin dejar de ser discreto.',
    melodySections: Object.freeze([
      frozenSection(
        {0:67,4:71,7:74,11:71,16:69,20:72,23:76,27:74,32:71,36:69,39:67,44:64,48:67,52:71,56:74,61:67},
        {6:55,14:59,22:57,30:62,38:59,46:55,54:57,62:55},
        {0:43,7:47,8:43,15:50,16:40,23:47,24:40,31:45,32:41,39:48,40:41,47:45,48:38,55:45,56:38,63:43},
      ),
      frozenSection(
        {2:69,6:72,10:76,14:74,18:72,22:69,26:67,30:64,34:67,38:71,42:74,46:79,50:76,54:72,58:69,62:67},
        {4:57,12:60,20:64,28:60,36:59,44:62,52:57,60:55},
        {0:45,7:52,8:45,15:48,16:43,23:50,24:43,31:47,32:40,39:47,40:40,47:43,48:41,55:48,56:41,63:45},
      ),
    ]),
  }),
  lofiPawnNotebook: Object.freeze({
    description: 'Lo-fi de escritorio con piano a lápiz, vibráfono de respuesta y un beat con bolsillo: íntimo, melódico y suficientemente rítmico para sostener una partida.',
    melodySections: Object.freeze([
      frozenSection(
        {3:64,8:62,13:59,18:61,23:57,29:60,34:55,39:59,45:62,50:60,55:57,61:64},
        {6:72,16:69,26:67,36:64,46:69,58:67},
        {0:40,7:47,12:38,16:45,23:43,28:50,32:41,39:48,44:38,48:45,55:43,60:47},
      ),
      frozenSection(
        {2:67,7:64,12:62,17:65,22:60,27:63,32:59,37:62,42:65,47:69,52:64,57:62,62:67},
        {5:74,15:71,25:69,35:67,45:72,55:69},
        {0:43,7:50,12:40,16:47,23:45,28:52,32:38,39:45,44:41,48:48,55:38,60:45},
      ),
    ]),
  }),
});

export const LOFI_SONGBOOK_IDS = Object.freeze(Object.keys(LOFI_SONGBOOK_REWRITES));

export function installLofiSongbook({ themes, options }) {
  for (const [id, rewrite] of Object.entries(LOFI_SONGBOOK_REWRITES)) {
    const theme = themes[id];
    if (!theme?.sections) continue;
    theme.sections = theme.sections.map((section, index) => {
      const written = rewrite.melodySections[index];
      return written ? { ...section, ...written } : section;
    });
    theme.description = rewrite.description;
    const option = options.find((entry) => entry.id === id);
    if (option) option.description = rewrite.description;
  }
}
