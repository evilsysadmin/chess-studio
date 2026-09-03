// Radio Matthias · expansión transversal del dial.
// Un tema original por cada género visible, todos sintetizados por Web Audio.
// Este módulo se instala sobre el catálogo mutable para evitar seguir engordando
// ambientCatalog.js, que ya actúa como archivo histórico de composiciones.

export const RADIO_MATTHIAS_GENRE_EXPANSION = Object.freeze({
  zenCourtyard0408: {
    id:'zenCourtyard0408', genre:'SPA / Zen', engine:'structured', label:'Zen · patio antes del alba',
    description:'Ney respirado, cuencos graves y cello suspendido; calma real, sin campanillas de balneario criminal.',
    stepMs:278, stepsPerSection:40, longFormMs:430000, leadInstrument:'breathFlute', counterInstrument:'cello', chordInstrument:'singingBowl', bassInstrument:'pad',
    sections:[
      {lead:{5:69,17:72,31:67},counter:{10:48,28:45},chords:{0:[52,59,64],20:[50,57,62]},bass:{0:40,20:38}},
      {lead:{7:72,19:74,33:69},counter:{12:50,30:47},chords:{0:[55,62,67],20:[52,59,64]},bass:{0:43,20:40}},
      {lead:{4:67,16:71,29:64},counter:{9:45,27:43},chords:{0:[48,55,60],20:[50,57,62]},bass:{0:36,20:38}},
    ],
  },
  velvetKnight0237: {
    id:'velvetKnight0237', genre:'Smooth Jazz', engine:'structured', label:'Smooth jazz · caballo de terciopelo',
    description:'Guitarra jazz, Rhodes y trompeta apagada en conversación lenta; club vacío, corbata floja y final complicado.',
    stepMs:158, stepsPerSection:64, longFormMs:438000, leadInstrument:'jazzGuitar', counterInstrument:'mutedHorn', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{2:64,10:67,18:71,26:69,34:67,42:64,50:62,58:64},counter:{14:76,30:74,46:71,62:69},chords:{0:[52,55,59,64],16:[50,53,57,62],32:[57,60,64,69],48:[55,59,62,67]},bass:{0:40,8:47,16:38,24:45,32:45,40:52,48:43,56:50},drums:{0:'B',8:'H',16:'S',32:'B',40:'H',48:'S'}},
      {lead:{4:67,12:71,20:74,28:72,36:69,44:67,52:65,60:62},counter:{8:79,24:76,40:74,56:71},chords:{0:[55,59,62,67],16:[52,55,59,64],32:[50,53,57,62],48:[57,60,64,69]},bass:{0:43,8:50,16:40,24:47,32:38,40:45,48:45,56:52},drums:{0:'B',12:'H',16:'S',32:'B',44:'H',48:'S'}},
    ],
  },
  bishopSunset: {
    id:'bishopSunset', genre:'Tropical House', engine:'structured', label:'Tropical house · alfil al atardecer',
    description:'Nylon sincopada, marimba seca y bajo redondo; playa nocturna sin cañón de espuma ni DJ gritón.',
    stepMs:124, stepsPerSection:64, longFormMs:402000, leadInstrument:'nylonGuitar', counterInstrument:'marimba', chordInstrument:'epiano', bassInstrument:'synthbass',
    sections:[
      {lead:{2:67,8:71,14:74,20:71,26:69,32:67,38:64,44:67,50:69,56:72,62:67},counter:{4:79,20:76,36:81,52:76},chords:{0:[55,59,62,67],16:[52,55,59,64],32:[57,60,64,69],48:[50,55,59,62]},bass:{0:43,8:43,16:40,24:40,32:45,40:45,48:38,56:38},drums:{0:'K',4:'H',8:'K',12:'H',16:'K',20:'H',24:'K',28:'H',32:'K',36:'H',40:'K',44:'H',48:'K',52:'H',56:'K',60:'H'}},
      {lead:{4:69,12:72,20:76,28:74,36:71,44:69,52:67,60:64},counter:{8:81,24:79,40:76,56:74},chords:{0:[57,60,64,69],16:[55,59,62,67],32:[52,55,59,64],48:[50,55,59,62]},bass:{0:45,8:45,16:43,24:43,32:40,40:40,48:38,56:38},drums:{0:'K',4:'H',8:'K',12:'H',16:'K',20:'H',24:'K',28:'H',32:'K',36:'H',40:'K',44:'H',48:'K',52:'H',56:'K',60:'H'}},
    ],
  },
  checkEngine: {
    id:'checkEngine', genre:'Energía', engine:'structured', label:'Synthwave · motor de jaque',
    description:'Arpegio oscuro, guitarra contenida y bajo de autopista; acelera sin convertirse en una pelea de taladros.',
    stepMs:88, stepsPerSection:64, longFormMs:356000, leadInstrument:'synth', counterInstrument:'guitar2', chordInstrument:'pad', bassInstrument:'synthbass',
    sections:[
      {lead:{0:64,8:67,16:71,24:69,32:72,40:71,48:67,56:64},counter:{4:52,12:55,20:59,28:57,36:55,44:60,52:59,60:55},chords:{0:[52,59,64],16:[55,62,67],32:[50,57,62],48:[53,60,65]},bass:{0:28,4:35,8:40,12:35,16:31,20:38,24:43,28:38,32:26,36:33,40:38,44:33,48:29,52:36,56:41,60:36},drums:{0:'K',4:'H',8:'S',12:'H',16:'K',20:'K',24:'S',28:'H',32:'K',36:'H',40:'S',44:'K',48:'K',52:'H',56:'S',60:'H'}},
      {lead:{0:67,8:71,16:74,24:72,32:76,40:74,48:71,56:67},counter:{4:55,12:59,20:62,28:60,36:59,44:64,52:62,60:59},chords:{0:[55,62,67],16:[57,64,69],32:[53,60,65],48:[50,57,62]},bass:{0:31,4:38,8:43,12:38,16:33,20:40,24:45,28:40,32:29,36:36,40:41,44:36,48:26,52:33,56:38,60:33},drums:{0:'K',4:'H',8:'S',12:'K',16:'K',20:'H',24:'S',28:'H',32:'K',36:'K',40:'S',44:'H',48:'K',52:'H',56:'S',60:'K'}},
      {lead:{4:72,12:74,20:76,28:79,36:76,44:74,52:72,60:67},counter:{8:64,24:67,40:69,56:67},chords:{0:[57,64,69],32:[55,62,67]},bass:{0:33,8:40,16:36,24:43,32:31,40:38,48:29,56:36},drums:{0:'K',4:'K',8:'S',12:'H',16:'K',20:'K',24:'S',28:'H',32:'K',36:'K',40:'S',44:'H',48:'K',52:'K',56:'S',60:'H'}},
    ],
  },
  rookAfterHours: {
    id:'rookAfterHours', genre:'Ecléctica', engine:'structured', label:'Post-rock · torre después de hora',
    description:'Tremolo limpio, cello y batería que crece por capas; épica contenida para no confundir pensar con conquistar Polonia.',
    stepMs:116, stepsPerSection:64, longFormMs:412000, leadInstrument:'tremolo', counterInstrument:'cello', chordInstrument:'guitar2', bassInstrument:'bass',
    sections:[
      {lead:{0:64,8:67,16:71,24:69,32:64,40:72,48:71,56:67},counter:{12:52,28:55,44:57,60:55},chords:{0:[52,59,64],32:[50,57,62]},bass:{0:40,8:47,16:43,24:47,32:38,40:45,48:43,56:45},drums:{0:'K',16:'S',32:'K',48:'S'}},
      {lead:{0:67,6:71,12:74,18:76,24:74,30:71,36:69,42:67,48:69,54:72,60:67},counter:{9:55,21:57,33:59,45:57,57:55},chords:{0:[55,62,67],32:[53,60,65]},bass:{0:43,8:50,16:47,24:50,32:41,40:48,48:45,56:48},drums:{0:'K',8:'H',16:'S',24:'H',32:'K',40:'H',48:'S',56:'H'}},
      {leadInstrument:'overdriveGuitar',lead:{4:72,12:74,20:76,28:79,36:76,44:74,52:72,60:67},counter:{8:57,24:60,40:62,56:60},chords:{0:[57,64,69],32:[55,62,67]},bass:{0:45,8:52,16:48,24:52,32:43,40:50,48:47,56:50},drums:{0:'K',4:'H',8:'S',12:'H',16:'K',20:'H',24:'S',28:'H',32:'K',36:'H',40:'S',44:'H',48:'K',52:'H',56:'S',60:'H'}},
    ],
  },
  queenChamberPrelude: {
    id:'queenChamberPrelude', genre:'Clásica', engine:'structured', label:'Preludio de la dama',
    description:'Clave, pizzicato y cello con contrapunto sobrio; cámara barroca original sin cosplay de compositor muerto.',
    stepMs:118, stepsPerSection:64, longFormMs:388000, leadInstrument:'harpsichord', counterInstrument:'pizz', chordInstrument:'strings', bassInstrument:'cello',
    sections:[
      {lead:{0:64,4:67,8:69,12:71,16:69,20:67,24:64,28:62,32:64,36:67,40:71,44:72,48:71,52:69,56:67,60:64},counter:{8:52,16:57,24:55,32:52,40:59,48:57,56:55},chords:{0:[52,55,59],16:[50,53,57],32:[55,59,62],48:[48,52,55]},bass:{0:40,16:38,32:43,48:36}},
      {lead:{0:67,4:71,8:72,12:74,16:72,20:71,24:67,28:65,32:67,36:71,40:74,44:76,48:74,52:72,56:71,60:67},counter:{4:55,12:60,20:59,28:55,36:62,44:60,52:59,60:55},chords:{0:[55,59,62],16:[57,60,64],32:[53,57,60],48:[50,55,59]},bass:{0:43,16:45,32:41,48:38}},
    ],
  },
  lofiPawnNotebook: {
    id:'lofiPawnNotebook', genre:'Lo-Fi / Chill', engine:'structured', label:'Lo-fi · cuaderno del peón',
    description:'Felt piano, Rhodes gastado y brushes mínimos; la banda sonora de apuntar una variante y tacharla cinco minutos después.',
    stepMs:168, stepsPerSection:64, longFormMs:420000, leadInstrument:'felt', counterInstrument:'vibes', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{2:64,10:67,18:71,26:69,34:64,42:67,50:62,58:64},counter:{14:76,30:74,46:72,62:71},chords:{0:[52,55,59,64],16:[50,53,57,62],32:[55,59,62,67],48:[53,57,60,65]},bass:{0:40,8:47,16:38,24:45,32:43,40:50,48:41,56:48},drums:{0:'B',12:'H',16:'B',28:'H',32:'B',44:'H',48:'B',60:'H'}},
      {lead:{4:67,12:71,20:74,28:72,36:69,44:67,52:64,60:62},counter:{8:79,24:76,40:74,56:72},chords:{0:[55,59,62,67],16:[52,55,59,64],32:[57,60,64,69],48:[50,53,57,62]},bass:{0:43,8:50,16:40,24:47,32:45,40:52,48:38,56:45},drums:{0:'B',12:'H',16:'B',28:'H',32:'B',44:'H',48:'B',60:'H'}},
    ],
  },
  wetCastleTape: {
    id:'wetCastleTape', genre:'Trip-Hop / Downtempo', engine:'structured', label:'Trip-hop · cinta del castillo mojado',
    description:'Rhodes oscuro, cello y beat roto; lluvia imaginaria en la Sala de Guerra y cero saxofón de anuncio de perfume.',
    stepMs:178, stepsPerSection:64, longFormMs:428000, leadInstrument:'rhodesWarm', counterInstrument:'cello', chordInstrument:'pad', bassInstrument:'synthbass',
    sections:[
      {lead:{4:57,16:60,28:64,40:62,52:57},counter:{10:45,26:48,42:47,58:43},chords:{0:[45,52,57],16:[48,55,60],32:[43,50,55],48:[41,48,53]},bass:{0:33,8:33,16:36,24:36,32:31,40:31,48:29,56:29},drums:{0:'K',10:'B',16:'S',30:'B',32:'K',42:'B',48:'S',62:'B'}},
      {lead:{6:60,18:64,30:65,42:62,54:59},counter:{12:48,28:50,44:45,60:43},chords:{0:[48,55,60],16:[45,52,57],32:[50,57,62],48:[43,50,55]},bass:{0:36,8:36,16:33,24:33,32:38,40:38,48:31,56:31},drums:{0:'K',12:'B',16:'S',28:'B',32:'K',44:'B',48:'S',60:'B'}},
    ],
  },
  rookVeranda: {
    id:'rookVeranda', genre:'Bossa / Latin Lounge', engine:'structured', label:'Bossa · torre en la veranda',
    description:'Guitarra limpia, Rhodes y contrabajo con bossa seca; elegante, cálida y sin convertirse en hilo musical de ascensor.',
    stepMs:144, stepsPerSection:64, longFormMs:408000, leadInstrument:'guitar2', counterInstrument:'rhodesWarm', chordInstrument:'epiano', bassInstrument:'uprightBass',
    sections:[
      {lead:{0:64,6:67,12:69,18:71,24:69,30:67,36:64,42:62,48:64,54:67,60:69},counter:{9:55,21:57,33:60,45:57,57:55},chords:{0:[52,57,60,64],16:[55,59,62,67],32:[57,60,64,69],48:[50,55,59,62]},bass:{0:40,8:47,16:43,24:50,32:45,40:52,48:38,56:45},drums:{0:'B',6:'H',12:'B',18:'H',24:'B',30:'H',36:'B',42:'H',48:'B',54:'H',60:'B'}},
      {lead:{3:67,9:71,15:72,21:74,27:72,33:69,39:67,45:64,51:67,57:69,63:64},counter:{12:59,28:60,44:57,60:55},chords:{0:[55,59,62,67],16:[52,57,60,64],32:[50,55,59,62],48:[57,60,64,69]},bass:{0:43,8:50,16:40,24:47,32:38,40:45,48:45,56:52},drums:{0:'B',8:'H',16:'B',24:'H',32:'B',40:'H',48:'B',56:'H'}},
    ],
  },
  sixtyFourKeys: {
    id:'sixtyFourKeys', genre:'Piano / Minimal', engine:'structured', label:'Piano · sesenta y cuatro',
    description:'Piano de fieltro y cello en ciclos que cambian una nota cada vez; minimalismo para gente que cuenta casillas.',
    stepMs:238, stepsPerSection:48, longFormMs:452000, leadInstrument:'felt', counterInstrument:'cello', chordInstrument:'felt', bassInstrument:'cello',
    sections:[
      {lead:{0:60,8:64,16:62,24:67,32:64,40:62},counter:{12:48,36:47},chords:{0:[48,55,60],24:[47,53,59]},bass:{0:36,24:35}},
      {lead:{0:62,8:65,16:64,24:69,32:65,40:64},counter:{12:50,36:48},chords:{0:[50,57,62],24:[48,55,60]},bass:{0:38,24:36}},
      {lead:{0:59,8:62,16:60,24:64,32:62,40:59},counter:{12:47,36:45},chords:{0:[47,53,59],24:[45,52,57]},bass:{0:35,24:33}},
    ],
  },
  blackArchive: {
    id:'blackArchive', genre:'Dark Ambient', engine:'structured', label:'Dark ambient · archivo negro',
    description:'Órgano bajo, coro lejano y cello suspendido; severo, lento y más biblioteca prohibida que casa del terror.',
    stepMs:318, stepsPerSection:40, longFormMs:462000, leadInstrument:'choir', counterInstrument:'cello', chordInstrument:'organ', bassInstrument:'organbass',
    sections:[
      {lead:{10:55,30:52},counter:{18:43,36:41},chords:{0:[36,43,48,52],20:[34,41,46,50]},bass:{0:24,20:22}},
      {lead:{8:57,28:53},counter:{16:45,34:40},chords:{0:[38,45,50,53],20:[33,40,45,48]},bass:{0:26,20:21}},
      {lead:{12:52,32:50},counter:{4:41,24:38},chords:{0:[31,38,43,47],20:[36,43,48,52]},bass:{0:19,20:24}},
    ],
  },
  sevilleLastLamp0248: {
    id:'sevilleLastLamp0248', genre:'Jazz / Mediterráneo', engine:'structured', label:'Sevilla · última lámpara 02:48',
    description:'Guitarra de nylon, clarinete y contrabajo; nocturna andalusí, melódica y con conversación real entre voces.',
    stepMs:154, stepsPerSection:64, longFormMs:448000, leadInstrument:'nylonGuitar', counterInstrument:'clarinet', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{0:64,6:65,12:68,18:67,24:64,30:62,36:61,42:64,48:67,54:65,60:64},counter:{9:72,27:70,45:68,63:67},chords:{0:[52,55,59,64],16:[49,53,56,61],32:[50,55,58,62],48:[47,52,55,59]},bass:{0:40,8:47,16:37,24:44,32:38,40:45,48:35,56:42},drums:{0:'K',8:'B',16:'S',24:'H',32:'K',40:'B',48:'S',56:'H'}},
      {lead:{2:67,10:68,18:72,26:70,34:67,42:65,50:64,58:61},counter:{14:76,30:72,46:70,62:68},chords:{0:[55,59,62,67],16:[52,56,59,64],32:[50,55,58,62],48:[49,53,56,61]},bass:{0:43,8:50,16:40,24:47,32:38,40:45,48:37,56:44},drums:{0:'K',12:'H',16:'S',32:'K',44:'H',48:'S'}},
      {lead:{4:62,12:65,20:67,28:64,36:60,44:62,52:59,60:57},counter:{8:70,24:68,40:65,56:64},chords:{0:[50,55,58,62],16:[48,53,57,60],32:[45,52,57,60],48:[47,52,55,59]},bass:{0:38,16:36,32:33,48:35},drums:{0:'B',16:'S',32:'B',48:'S'}},
    ],
  },
  bishopCircuit: {
    id:'bishopCircuit', genre:'Electrónica / Experimental', engine:'structured', label:'Electrónica · circuito del alfil',
    description:'Pulsos cruzados, cristal oscuro y bajo sintético; electrónica rara con melodía, no una lavadora diagnosticándose sola.',
    stepMs:104, stepsPerSection:64, longFormMs:382000, leadInstrument:'pulse', counterInstrument:'glass', chordInstrument:'synth', bassInstrument:'synthbass',
    sections:[
      {lead:{0:60,7:64,14:67,21:65,28:69,35:67,42:64,49:62,56:60,63:57},counter:{5:76,19:79,33:74,47:72,61:76},chords:{0:[48,55,60],16:[50,57,62],32:[45,52,57],48:[47,54,59]},bass:{0:24,8:31,16:26,24:33,32:21,40:28,48:23,56:30},drums:{0:'K',6:'H',16:'S',22:'H',32:'K',38:'H',48:'S',54:'H'}},
      {lead:{3:64,10:67,17:71,24:69,31:72,38:69,45:67,52:64,59:62},counter:{8:79,24:83,40:77,56:76},chords:{0:[52,59,64],16:[55,62,67],32:[50,57,62],48:[53,60,65]},bass:{0:28,8:35,16:31,24:38,32:26,40:33,48:29,56:36},drums:{0:'K',8:'H',16:'S',24:'H',32:'K',40:'H',48:'S',56:'H'}},
    ],
  },
  winterBoard: {
    id:'winterBoard', genre:'Ambient / Otros', engine:'structured', label:'Ambient · tablero de invierno',
    description:'Cuerdas suaves, flauta y piano muy atrás; paisaje frío y amplio para una partida que no necesita banda sonora heroica.',
    stepMs:246, stepsPerSection:48, longFormMs:446000, leadInstrument:'strings', counterInstrument:'breathFlute', chordInstrument:'felt', bassInstrument:'cello',
    sections:[
      {lead:{4:64,14:67,24:69,34:67,44:62},counter:{9:76,29:72},chords:{0:[48,55,60],24:[45,52,57]},bass:{0:36,24:33}},
      {lead:{6:67,16:71,26:72,36:69,46:64},counter:{11:79,31:76},chords:{0:[50,57,62],24:[47,53,59]},bass:{0:38,24:35}},
      {lead:{2:62,14:65,26:64,38:60},counter:{20:72,44:69},chords:{0:[45,52,57],24:[43,50,55]},bass:{0:33,24:31}},
    ],
  },
});

export const RADIO_MATTHIAS_THEME_IDS = Object.freeze(Object.keys(RADIO_MATTHIAS_GENRE_EXPANSION));

export function installRadioMatthiasExpansion({ themes, options, groups, genreOrder, hiddenIds = new Set() }) {
  for (const theme of Object.values(RADIO_MATTHIAS_GENRE_EXPANSION)) {
    if (!themes[theme.id]) themes[theme.id] = theme;
    if (!hiddenIds.has(theme.id) && !options.some((entry) => entry.id === theme.id)) {
      options.push({ id: theme.id, label: theme.label, description: theme.description, genre: theme.genre });
    }
  }

  const nextGroups = genreOrder
    .map((genre) => ({ genre, themes: options.filter((theme) => theme.genre === genre) }))
    .filter((group) => group.themes.length);
  groups.splice(0, groups.length, ...nextGroups);

  return RADIO_MATTHIAS_THEME_IDS;
}
