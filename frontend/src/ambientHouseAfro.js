// House / Afro original para Radio Matthias.
// Composiciones completas: four-on-the-floor, bajo sincopado, percusión
// contenida y hooks instrumentales/vocales. La referencia es de lenguaje y
// energía; no se reutilizan melodías, armonías ni arreglos ajenos.

export const HOUSE_AFRO_GENRE = 'House / Afro';

function freezeLine(line) {
  return Object.freeze({ ...line });
}

function offbeatChords(progression, offsets = [2, 6, 10, 14]) {
  const line = {};
  progression.forEach((chord, bar) => {
    offsets.forEach((offset) => { line[(bar * 16) + offset] = Object.freeze([...chord]); });
  });
  return freezeLine(line);
}

function rollingBass(roots, offsets = [0, 3, 6, 8, 11, 14]) {
  const line = {};
  roots.forEach((root, bar) => {
    offsets.forEach((offset, index) => {
      line[(bar * 16) + offset] = index === 2 || index === 4 ? root + 7 : root;
    });
  });
  return freezeLine(line);
}

function houseSection({ lead, counter, progression, roots, chordOffsets, bassOffsets }) {
  return Object.freeze({
    lead: freezeLine(lead),
    counter: freezeLine(counter),
    chords: offbeatChords(progression, chordOffsets),
    bass: rollingBass(roots, bassOffsets),
  });
}

export const HOUSE_AFRO_THEMES = Object.freeze({
  midnightDevotion: Object.freeze({
    id:'midnightDevotion', genre:HOUSE_AFRO_GENRE, engine:'structured', label:'Afro house · devoción de medianoche',
    description:'Afro house nocturno: piano house, bajo profundo y una llamada vocal aérea sobre pieles sincopadas. Elegante, sensual y con hook propio.',
    stepMs:125, stepsPerSection:64, longFormMs:414000,
    leadInstrument:'housePiano', counterInstrument:'vocalAir', chordInstrument:'housePiano', bassInstrument:'synthbass',
    sections:Object.freeze([
      houseSection({
        lead:{1:71,5:74,9:78,14:81,19:78,23:76,28:74,34:71,38:74,43:83,47:81,53:78,61:74},
        counter:{7:83,15:81,25:86,31:83,39:81,47:78,55:83,63:81},
        progression:[[47,50,54,59],[43,47,50,55],[50,54,57,62],[45,49,52,57]], roots:[35,31,38,33],
      }),
      houseSection({
        lead:{2:74,6:78,11:81,15:83,21:81,26:78,30:76,35:74,41:78,45:86,50:83,55:81,62:78},
        counter:{4:86,13:83,22:81,29:78,37:83,46:86,54:81,61:78},
        progression:[[50,54,57,62],[45,49,52,57],[47,50,54,59],[43,47,50,55]], roots:[38,33,35,31],
      }),
      houseSection({
        lead:{5:71,11:74,18:78,25:76,33:74,40:71,47:74,54:78,61:74},
        counter:{8:83,20:81,32:78,44:81,56:83},
        progression:[[47,50,54,59],[43,47,50,55],[45,49,52,57],[47,50,54,59]], roots:[35,31,33,35],
        chordOffsets:[2,10], bassOffsets:[0,6,8,14],
      }),
    ]),
  }),

  terracottaPulse: Object.freeze({
    id:'terracottaPulse', genre:HOUSE_AFRO_GENRE, engine:'structured', label:'Organic house · pulso de terracota',
    description:'Organic house de piano percusivo, pluck oscuro y marimba cálida: un riff ascendente se cruza con congas sintéticas y bajo rodante.',
    stepMs:123, stepsPerSection:64, longFormMs:408000,
    leadInstrument:'housePiano', counterInstrument:'tropicalPluck', chordInstrument:'widePad', bassInstrument:'synthbass',
    sections:Object.freeze([
      houseSection({
        lead:{2:73,6:76,10:80,15:83,20:80,24:78,29:76,35:73,39:76,44:85,49:83,53:80,59:78,63:76},
        counter:{4:68,13:71,22:73,30:68,37:71,46:76,54:73,61:71},
        progression:[[49,52,56,61],[45,49,52,57],[52,56,59,64],[47,51,54,59]], roots:[37,33,40,35],
      }),
      houseSection({
        lead:{1:76,5:80,12:83,16:85,22:83,27:80,31:78,36:76,42:80,47:88,51:85,57:83,62:80},
        counter:{7:68,15:73,25:71,32:76,40:73,48:80,56:76,63:73},
        progression:[[52,56,59,64],[47,51,54,59],[49,52,56,61],[45,49,52,57]], roots:[40,35,37,33],
      }),
      houseSection({
        lead:{4:73,9:76,15:80,22:78,28:76,36:73,43:76,50:80,57:83,62:76},
        counter:{6:68,18:71,30:73,42:71,54:68,61:71},
        progression:[[49,52,56,61],[45,49,52,57],[47,51,54,59],[49,52,56,61]], roots:[37,33,35,37],
        chordOffsets:[2,10], bassOffsets:[0,3,8,14],
      }),
    ]),
  }),

  velvetLift: Object.freeze({
    id:'velvetLift', genre:HOUSE_AFRO_GENRE, engine:'structured', label:'Soulful house · ascenso de terciopelo',
    description:'Soulful house de piano abierto, Rhodes y guitarra limpia: acordes luminosos, bajo con intención y un hook que sube sin convertirse en EDM de festival.',
    stepMs:124, stepsPerSection:64, longFormMs:432000,
    leadInstrument:'housePiano', counterInstrument:'jazzGuitar', chordInstrument:'rhodesWarm', bassInstrument:'synthbass',
    sections:Object.freeze([
      houseSection({
        lead:{2:67,6:71,10:74,14:76,18:74,23:71,29:69,34:67,38:71,42:74,47:79,52:76,58:74,62:71},
        counter:{7:76,15:79,24:74,31:71,39:76,47:81,55:79,63:74},
        progression:[[48,52,55,60],[45,48,52,57],[50,53,57,62],[43,47,50,55]], roots:[36,33,38,31],
      }),
      houseSection({
        lead:{1:71,5:74,9:76,13:79,19:81,24:79,28:76,33:74,37:76,41:79,46:83,51:81,57:79,61:76},
        counter:{4:79,12:81,20:76,29:74,36:81,44:79,53:83,60:76},
        progression:[[50,53,57,62],[43,47,50,55],[48,52,55,60],[45,48,52,57]], roots:[38,31,36,33],
      }),
      houseSection({
        lead:{3:67,8:71,14:74,21:76,27:74,34:71,40:69,46:71,52:74,58:76,63:71},
        counter:{6:76,18:74,30:79,42:76,54:81,62:74},
        progression:[[48,52,55,60],[45,48,52,57],[43,47,50,55],[48,52,55,60]], roots:[36,33,31,36],
        chordOffsets:[2,10], bassOffsets:[0,3,8,11,14],
      }),
    ]),
  }),

  cityAfterglow: Object.freeze({
    id:'cityAfterglow', genre:HOUSE_AFRO_GENRE, engine:'structured', label:'Deep house · resplandor de ciudad',
    description:'Deep house nocturno de Rhodes, voz etérea muy dosificada y pad ancho. Groove hipnótico, armonía cálida y suficiente espacio para dejar respirar la partida.',
    stepMs:123, stepsPerSection:64, longFormMs:426000,
    leadInstrument:'rhodesWarm', counterInstrument:'vocalAir', chordInstrument:'widePad', bassInstrument:'synthbass',
    sections:Object.freeze([
      houseSection({
        lead:{2:64,7:67,11:71,16:74,21:71,26:69,30:67,35:64,40:67,45:76,50:74,55:71,60:69,63:67},
        counter:{6:76,17:74,25:79,34:76,43:74,52:81,60:79},
        progression:[[45,48,52,57],[41,45,48,53],[48,52,55,60],[43,47,50,55]], roots:[33,29,36,31],
      }),
      houseSection({
        lead:{1:67,6:71,10:74,15:76,20:79,25:76,29:74,34:71,39:74,44:79,49:81,54:79,59:76,63:74},
        counter:{4:79,13:76,22:74,31:81,40:79,49:83,58:76},
        progression:[[48,52,55,60],[43,47,50,55],[45,48,52,57],[41,45,48,53]], roots:[36,31,33,29],
      }),
      houseSection({
        lead:{4:64,10:67,16:71,23:69,29:67,36:64,43:67,50:71,57:74,62:67},
        counter:{8:76,20:74,32:79,44:76,56:74},
        progression:[[45,48,52,57],[41,45,48,53],[43,47,50,55],[45,48,52,57]], roots:[33,29,31,33],
        chordOffsets:[2,10], bassOffsets:[0,6,8,11,14],
      }),
    ]),
  }),
});

export const HOUSE_AFRO_THEME_IDS = Object.freeze(Object.keys(HOUSE_AFRO_THEMES));

export const HOUSE_AFRO_PROFILES = Object.freeze({
  midnightDevotion: Object.freeze({
    family:'afro-house-midnight-vocal', preserveSectionOrder:true, harmonyPath:Object.freeze([0,0,-2,3,0,5,-2,0]),
    swing:0.025, warmth:0.92, releaseScale:0.78, space:0.06, delayMs:94,
    leadInstrument:'housePiano', counterInstrument:'vocalAir', chordInstrument:'housePiano', bassInstrument:'synthbass',
    chordHoldSteps:2.45, bassHoldSteps:1.35,
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    mix:Object.freeze({lead:0.68,counter:0.30,bass:1.18,chord:0.62}),
    percussion:Object.freeze({period:16,kit:'afro-house-deep',punch:1.23,sidechainDepth:0.68,sidechainReleaseMs:172,pattern:Object.freeze({0:'K',2:'H',3:'B',4:'A',6:'H',7:'B',8:'K',10:'B',11:'H',12:'A',14:'H',15:'B'})}),
    signature:Object.freeze({instrument:'vocalAir',sections:Object.freeze([0,1]),everyCycles:2,repeatPeriod:64,durationSteps:4.2,volume:0.18,motif:Object.freeze({7:83,23:86,39:81,55:78})}),
  }),
  terracottaPulse: Object.freeze({
    family:'organic-house-terracotta-piano', preserveSectionOrder:true, harmonyPath:Object.freeze([0,3,0,-2,5,0,7,0]),
    swing:0.034, warmth:0.98, releaseScale:0.76, space:0.055, delayMs:82,
    leadInstrument:'housePiano', counterInstrument:'tropicalPluck', chordInstrument:'widePad', bassInstrument:'synthbass',
    chordHoldSteps:2.7, bassHoldSteps:1.45,
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    mix:Object.freeze({lead:0.70,counter:0.34,bass:1.16,chord:0.54}),
    percussion:Object.freeze({period:16,kit:'afro-house-terracotta',punch:1.21,sidechainDepth:0.62,sidechainReleaseMs:158,pattern:Object.freeze({0:'K',2:'B',4:'A',5:'H',7:'B',8:'K',10:'H',11:'B',12:'A',14:'B',15:'H'})}),
    signature:Object.freeze({instrument:'tropicalPluck',sections:Object.freeze([0,2]),everyCycles:2,repeatPeriod:64,durationSteps:2.8,volume:0.17,motif:Object.freeze({6:73,21:80,38:76,54:83})}),
  }),
  velvetLift: Object.freeze({
    family:'soulful-house-velvet-piano-guitar', preserveSectionOrder:true, harmonyPath:Object.freeze([0,0,5,-2,3,0,5,0]),
    swing:0.038, warmth:1.04, releaseScale:0.84, space:0.07, delayMs:108,
    leadInstrument:'housePiano', counterInstrument:'jazzGuitar', chordInstrument:'rhodesWarm', bassInstrument:'synthbass',
    chordHoldSteps:2.65, bassHoldSteps:1.42,
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    mix:Object.freeze({lead:0.66,counter:0.25,bass:1.12,chord:0.58}),
    percussion:Object.freeze({period:16,kit:'afro-house-deep',punch:1.16,sidechainDepth:0.63,sidechainReleaseMs:184,pattern:Object.freeze({0:'K',2:'H',4:'A',6:'B',7:'H',8:'K',10:'H',11:'B',12:'A',14:'H',15:'B'})}),
    signature:Object.freeze({instrument:'jazzGuitar',sections:Object.freeze([0,1]),everyCycles:2,repeatPeriod:64,durationSteps:3.6,volume:0.16,motif:Object.freeze({7:76,23:79,39:74,55:81})}),
  }),
  cityAfterglow: Object.freeze({
    family:'deep-house-city-rhodes-vocal', preserveSectionOrder:true, harmonyPath:Object.freeze([0,-2,0,3,0,5,3,0]),
    swing:0.028, warmth:1.08, releaseScale:0.92, space:0.085, delayMs:132,
    leadInstrument:'rhodesWarm', counterInstrument:'vocalAir', chordInstrument:'widePad', bassInstrument:'synthbass',
    chordHoldSteps:2.7, bassHoldSteps:1.5,
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    mix:Object.freeze({lead:0.60,counter:0.20,bass:1.10,chord:0.52}),
    percussion:Object.freeze({period:16,kit:'afro-house-terracotta',punch:1.12,sidechainDepth:0.60,sidechainReleaseMs:196,pattern:Object.freeze({0:'K',2:'H',4:'A',6:'B',8:'K',10:'H',12:'A',14:'B',15:'H'})}),
    signature:Object.freeze({instrument:'vocalAir',sections:Object.freeze([0,1]),everyCycles:3,repeatPeriod:64,durationSteps:4.8,volume:0.13,motif:Object.freeze({6:76,22:79,38:74,54:81})}),
  }),
});

export function installHouseAfro({ themes, options, groups, genreOrder }) {
  if (!genreOrder.includes(HOUSE_AFRO_GENRE)) {
    const tropicalIndex = genreOrder.indexOf('Tropical House');
    genreOrder.splice(tropicalIndex >= 0 ? tropicalIndex + 1 : genreOrder.length, 0, HOUSE_AFRO_GENRE);
  }

  for (const theme of Object.values(HOUSE_AFRO_THEMES)) {
    if (!themes[theme.id]) themes[theme.id] = theme;
    if (!options.some((entry) => entry.id === theme.id)) {
      options.push({ id:theme.id, label:theme.label, description:theme.description, genre:theme.genre });
    }
  }

  const nextGroups = genreOrder
    .map((genre) => ({ genre, themes:options.filter((theme) => theme.genre === genre) }))
    .filter((group) => group.themes.length);
  groups.splice(0, groups.length, ...nextGroups);
  return HOUSE_AFRO_THEME_IDS;
}

export function withHouseAfroProduction(theme, feel) {
  const profile = HOUSE_AFRO_PROFILES[theme?.id];
  if (!profile) return feel;
  return Object.freeze({ ...(feel || {}), ...profile });
}
