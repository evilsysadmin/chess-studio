// Synth Metal con estructura de himno: riffs de guitarra reconocibles, synths
// que responden y estribillos que abren el registro. El lenguaje bebe del
// synthwave-rock épico, pero todas las frases y progresiones son originales.

function line(events) {
  return Object.freeze({ ...events });
}

function section(lead, counter, chords, bass) {
  return Object.freeze({
    lead:line(lead), counter:line(counter), chords:line(chords), bass:line(bass),
  });
}

function melody(lead, counter) {
  return Object.freeze({ lead:line(lead), counter:line(counter) });
}

export const SYNTH_METAL_ANTHEMS = Object.freeze({
  neonSiege: Object.freeze({
    stepMs:88,
    description:'Synth metal de neón con riff de guitarra, synth ascendente y un estribillo original enorme. Rápido y épico, pero ya no es una ametralladora de semicorcheas.',
    sections:Object.freeze([
      section(
        {0:52,2:52,4:55,7:52,10:59,12:57,14:55,16:52,18:52,21:55,24:60,27:59,30:55,32:50,34:52,37:55,40:59,43:57,46:52,48:52,51:55,54:62,58:60,62:59},
        {6:76,14:71,22:79,30:74,38:76,46:83,54:81,63:76},
        {0:[40,47,52],16:[43,50,55],32:[38,45,50],48:[45,52,57]},
        {0:28,2:28,4:28,7:28,10:35,12:33,14:31,16:28,18:28,21:31,24:36,27:35,30:31,32:26,34:28,37:31,40:35,43:33,46:28,48:28,51:31,54:38,58:36,62:35},
      ),
      section(
        {1:55,4:59,8:62,12:59,17:64,20:62,25:59,29:55,34:57,38:60,42:64,47:62,51:60,56:59,61:55},
        {2:79,10:83,18:86,26:83,35:81,43:88,51:86,59:83},
        {0:[43,50,55],16:[46,53,58],32:[45,52,57],48:[40,47,52]},
        {0:31,3:31,6:35,8:31,11:38,14:36,16:34,19:31,22:31,24:35,27:40,30:38,32:33,35:36,38:40,40:36,43:40,46:38,48:36,51:35,54:31,57:28,60:31,63:35},
      ),
      section(
        {0:64,4:67,8:71,12:69,16:67,20:64,24:62,28:64,32:67,36:71,40:76,44:74,48:71,52:69,56:67,60:64},
        {2:76,6:79,14:83,18:81,26:79,34:83,38:88,46:86,50:83,58:79},
        {0:[52,59,64],16:[48,55,60],32:[55,62,67],48:[50,57,62]},
        {0:40,4:47,8:40,12:47,16:36,20:43,24:36,28:43,32:43,36:50,40:43,44:50,48:38,52:45,56:38,60:45},
      ),
      section(
        {0:52,3:55,6:59,10:64,14:62,16:55,19:59,22:67,26:64,30:62,32:57,35:60,38:64,42:69,46:67,48:59,51:62,54:71,58:69,62:64},
        {4:76,12:79,20:83,28:81,36:84,44:88,52:86,60:83},
        {0:[40,47,52],16:[43,50,55],32:[45,52,57],48:[47,54,59]},
        {0:28,4:35,8:31,12:35,16:31,20:38,24:35,28:38,32:33,36:40,40:36,44:40,48:35,52:42,56:40,60:35},
      ),
    ]),
  }),

  overclockedKnight: Object.freeze({
    stepMs:100,
    description:'Synth metal de galope elástico: guitarra rítmica, lead analógico cantable y un estribillo de arena futurista. Cambia de escena y deja hueco antes de volver a cargar.',
    sections:Object.freeze([
      section(
        {0:64,6:67,9:71,14:67,18:72,22:71,27:67,31:64,35:64,40:67,43:74,48:72,53:71,57:67,62:64},
        {0:52,3:52,7:55,10:52,12:59,15:57,18:55,22:52,24:52,27:55,31:60,34:59,38:57,42:55,46:52,49:55,52:59,55:55,58:62,61:60,63:59},
        {0:[40,47,52],16:[38,45,50],32:[43,50,55],48:[45,52,57]},
        {0:28,3:28,4:31,7:28,8:35,11:33,12:31,15:28,16:26,19:26,20:29,23:26,24:33,27:31,28:29,31:26,32:31,35:31,36:35,39:31,40:38,43:36,44:35,47:31,48:33,51:33,52:36,55:33,56:40,59:38,60:36,63:33},
      ),
      section(
        {2:67,7:71,11:74,16:76,21:74,25:71,30:69,34:67,39:71,44:79,48:76,54:74,59:71,63:67},
        {4:55,8:59,13:62,17:59,23:64,28:62,32:59,37:57,42:60,46:64,51:62,56:60,61:57},
        {0:[43,50,55],16:[45,52,57],32:[41,48,53],48:[45,52,57]},
        {0:31,3:31,6:35,8:38,11:36,14:35,16:33,19:33,22:36,24:40,27:38,30:36,32:29,35:29,38:33,40:36,43:34,46:33,48:33,51:36,54:40,56:38,59:36,62:33},
      ),
      section(
        {0:67,4:71,8:74,12:76,16:74,20:71,24:69,28:67,32:71,36:74,40:79,44:81,48:79,52:76,56:74,60:71},
        {2:79,10:83,18:86,26:83,34:81,42:88,50:86,58:83},
        {0:[55,62,67],16:[57,64,69],32:[53,60,65],48:[50,57,62]},
        {0:43,3:50,6:43,9:50,12:43,16:45,19:52,22:45,25:52,28:45,32:41,35:48,38:41,41:48,44:41,48:38,51:45,54:38,57:45,60:38},
      ),
      section(
        {3:64,9:67,15:71,22:69,28:67,35:64,41:67,47:74,54:72,60:67},
        {0:52,6:55,12:59,18:57,24:55,30:52,36:57,42:60,48:64,56:59,62:55},
        {0:[40,47,52],24:[38,45,50],48:[43,50,55]},
        {0:28,6:35,12:31,18:28,24:26,30:33,36:29,42:26,48:31,54:38,60:35},
      ),
    ]),
  }),

  reactorGambit: Object.freeze({
    description:'Synth metal cinematográfico: riff pesado, synth heroico y un estribillo original que crece hasta la reprise. Potencia de reactor con melodía, no ruido industrial continuo.',
    melodySections:Object.freeze([
      melody({0:52,7:55,15:59,23:57,32:52,39:55,47:60,56:59},{11:64,27:67,43:71,60:67}),
      melody({0:52,3:52,7:55,11:59,15:57,19:55,23:60,27:59,31:55,35:50,39:52,43:59,47:57,51:52,55:62,59:60,63:59},{5:67,13:71,21:69,29:76,37:72,45:79,53:76,61:71}),
      melody({0:64,4:67,8:71,12:69,16:67,20:64,24:62,28:64,32:67,36:71,40:76,44:74,48:71,52:69,56:67,60:64},{2:76,10:79,18:83,26:81,34:84,42:88,50:86,58:83}),
      melody({0:52,9:50,17:47,26:50,34:52,43:55,51:57,60:59},{6:64,14:62,22:59,30:62,38:67,46:69,54:71,62:74}),
      melody({0:52,3:55,6:59,10:64,14:62,16:55,19:59,22:67,26:64,30:62,32:57,35:60,38:64,42:69,46:67,48:59,51:62,54:71,58:69,62:64},{4:76,12:79,20:83,28:81,36:84,44:88,52:86,60:83}),
    ]),
  }),
});

export const SYNTH_METAL_ANTHEM_IDS = Object.freeze(Object.keys(SYNTH_METAL_ANTHEMS));

export function installSynthMetalAnthems({ themes, options }) {
  for (const [id, anthem] of Object.entries(SYNTH_METAL_ANTHEMS)) {
    const theme = themes[id];
    if (!theme) continue;
    if (anthem.sections) theme.sections = [...anthem.sections];
    else if (anthem.melodySections) {
      theme.sections = theme.sections.map((source, index) => ({ ...source, ...(anthem.melodySections[index] || {}) }));
    }
    if (anthem.stepMs) theme.stepMs = anthem.stepMs;
    theme.description = anthem.description;
    const option = options.find((entry) => entry.id === id);
    if (option) option.description = anthem.description;
  }
}
