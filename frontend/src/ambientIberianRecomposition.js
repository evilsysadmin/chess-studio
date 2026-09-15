function frozenMap(value) {
  return Object.freeze(value);
}

function section({ leadInstrument, counterInstrument, lead, counter, chords, bass, drums = {} }) {
  return Object.freeze({
    ...(leadInstrument ? { leadInstrument } : {}),
    ...(counterInstrument ? { counterInstrument } : {}),
    lead:frozenMap(lead),
    counter:frozenMap(counter),
    chords:frozenMap(chords),
    bass:frozenMap(bass),
    drums:frozenMap(drums),
  });
}

const COSTA_SECTIONS = Object.freeze([
  section({
    lead:{ 0:67,4:69,8:71,12:74,16:71,20:69,24:67,28:64,32:67,36:69,40:74,44:76,48:74,52:71,56:69,60:67 },
    counter:{ 6:64,14:67,22:69,30:67,38:71,46:69,54:67,62:64 },
    chords:{ 0:[55,59,62,67],16:[57,60,64,69],32:[55,59,62,67],48:[53,57,60,64] },
    bass:{ 0:43,4:50,8:47,12:50,16:45,20:52,24:48,28:52,32:43,36:50,40:47,44:50,48:41,52:48,56:45,60:48 },
  }),
  section({
    leadInstrument:'oudJazz', counterInstrument:'guitar2',
    lead:{ 0:71,4:74,8:76,12:74,16:71,20:69,24:67,28:69,32:71,36:74,40:78,44:76,48:74,52:71,56:69,60:67 },
    counter:{ 2:67,10:69,18:71,26:67,34:69,42:71,50:74,58:69 },
    chords:{ 0:[57,60,64,69],16:[55,59,62,67],32:[59,62,66,71],48:[53,57,60,64] },
    bass:{ 0:45,4:52,8:48,12:52,16:43,20:50,24:47,28:50,32:47,36:54,40:50,44:54,48:41,52:48,56:45,60:48 },
  }),
  section({
    lead:{ 0:67,8:71,16:74,24:69,32:76,40:74,48:71,56:67 },
    counter:{ 4:64,12:67,20:69,28:67,36:71,44:69,52:67,60:64 },
    chords:{ 0:[55,59,62,67],24:[53,57,60,64],40:[57,60,64,69],56:[55,59,62,67] },
    bass:{ 0:43,8:47,16:50,24:41,32:45,40:48,48:50,56:43 },
  }),
  section({
    lead:{ 0:67,4:69,8:71,12:74,16:76,20:74,24:71,28:69,32:67,36:71,40:74,44:79,48:76,52:74,56:71,60:67 },
    counter:{ 6:64,18:67,30:69,42:71,54:69 },
    chords:{ 0:[55,59,62,67],24:[57,60,64,69],48:[55,59,62,67] },
    bass:{ 0:43,4:50,8:47,12:50,16:45,20:52,24:48,28:52,32:47,36:54,40:50,44:54,48:43,52:50,56:47,60:43 },
  }),
]);

const MALAGA_SECTIONS = Object.freeze([
  section({
    lead:{ 4:67,12:63,20:64,28:59,36:62,44:58,52:60,60:55 },
    counter:{ 9:74,25:70,41:72,57:67 },
    chords:{ 0:[48,51,55,59],24:[45,48,52,56],48:[43,47,50,55] },
    bass:{ 0:36,8:43,16:39,24:33,32:40,40:35,48:31,56:38 },
  }),
  section({
    lead:{ 0:62,7:65,16:61,23:58,32:60,39:63,48:59,55:55 },
    counter:{ 12:69,28:66,44:70,60:62 },
    chords:{ 0:[50,53,57,61],28:[46,50,53,58],56:[48,51,55,59] },
    bass:{ 0:38,8:45,16:41,24:34,32:36,40:43,48:35,56:31 },
  }),
  section({
    lead:{ 8:59,24:62,40:57,56:55 },
    counter:{ 2:67,18:63,34:65,50:60 },
    chords:{ 0:[48,51,55,59],32:[43,47,50,55] },
    bass:{ 0:36,16:31,32:38,48:33 },
  }),
  section({
    lead:{ 0:67,8:63,16:64,24:59,32:62,40:58,48:60,56:55 },
    counter:{ 5:74,21:70,37:72,53:67 },
    chords:{ 0:[48,51,55,59],28:[45,48,52,56],56:[43,47,50,55] },
    bass:{ 0:36,8:43,16:33,24:40,32:35,40:31,48:38,56:36 },
  }),
]);

export function installIberianRecomposition({ themes }) {
  const coast = themes?.andalusianCoast;
  const malaga = themes?.malagaLastTram;
  if (!coast || !malaga) return;

  themes.andalusianCoast = {
    ...coast,
    stepMs:132,
    stepsPerSection:64,
    leadInstrument:'guitar2',
    counterInstrument:'oudJazz',
    chordInstrument:'epiano',
    bassInstrument:'bass',
    sections:COSTA_SECTIONS,
  };

  themes.malagaLastTram = {
    ...malaga,
    stepMs:176,
    stepsPerSection:64,
    leadInstrument:'guitar2',
    counterInstrument:'clarinet',
    chordInstrument:'epiano',
    bassInstrument:'bass',
    sections:MALAGA_SECTIONS,
  };
}

export const IBERIAN_RECOMPOSITION_IDS = Object.freeze(['andalusianCoast', 'malagaLastTram']);
