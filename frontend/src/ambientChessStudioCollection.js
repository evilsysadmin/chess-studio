// Seis partituras originales escritas expresamente para Chess Studio.
//
// Las cuatro primeras amplían la sala clásica sin citar obras existentes. Las
// dos últimas son los comodines del estudio: minimalismo de tablero y tensión
// de reloj. Todo son datos deterministas para el secuenciador Web Audio.

export const CHESS_STUDIO_COLLECTION = Object.freeze({
  queenSiciliana: Object.freeze({
    id:'queenSiciliana', genre:'Clásica', engine:'structured', label:'Siciliana de la dama',
    description:'Cuerdas en seis por ocho, clarinete y cello: una danza de cámara elegante que guarda la amenaza para la segunda frase.',
    stepMs:178, stepsPerSection:48, longFormMs:426000, leadInstrument:'strings', counterInstrument:'clarinet', chordInstrument:'strings', bassInstrument:'cello',
    sections:Object.freeze([
      Object.freeze({lead:{0:69,6:72,12:76,18:74,24:72,30:69,36:67,42:64},counter:{9:57,21:60,33:59,45:57},chords:{0:[57,60,64],24:[55,59,62]},bass:{0:45,12:40,24:43,36:40}}),
      Object.freeze({lead:{0:72,6:76,12:79,18:77,24:74,30:71,36:72,42:69},counter:{6:60,18:64,30:62,42:60},chords:{0:[60,64,67],24:[59,62,65]},bass:{0:48,12:43,24:47,36:43}}),
      Object.freeze({lead:{0:74,6:77,12:81,18:79,24:76,30:72,36:74,42:71},counter:{9:62,21:65,33:64,45:60},chords:{0:[62,65,69],24:[57,60,64]},bass:{0:50,12:45,24:45,36:40}}),
      Object.freeze({lead:{0:72,8:69,16:67,24:64,32:69,40:57},counter:{12:76,28:72,44:69},chords:{0:[57,60,64],24:[53,57,60]},bass:{0:45,24:41}}),
    ]),
  }),
  rookPassacaglia: Object.freeze({
    id:'rookPassacaglia', genre:'Clásica', engine:'structured', label:'Passacaglia de la torre',
    description:'Bajo obstinado, órgano y cuerdas que levantan una fortaleza voz a voz; severa, paciente y absolutamente inevitable.',
    stepMs:224, stepsPerSection:32, longFormMs:442000, leadInstrument:'organ', counterInstrument:'strings', chordInstrument:'organ', bassInstrument:'cello',
    sections:Object.freeze([
      Object.freeze({lead:{8:60,16:63,24:62},counter:{12:67,28:65},chords:{0:[48,55,60],16:[46,53,58]},bass:{0:36,4:31,8:32,12:34,16:34,20:29,24:31,28:36}}),
      Object.freeze({lead:{4:63,12:67,20:65,28:62},counter:{8:72,24:70},chords:{0:[51,55,60,63],16:[50,53,58,62]},bass:{0:36,4:31,8:32,12:34,16:34,20:29,24:31,28:36}}),
      Object.freeze({lead:{0:67,8:70,16:72,24:68},counter:{4:75,12:74,20:77,28:72},chords:{0:[48,55,60,63],16:[46,53,58,62]},bass:{0:36,4:31,8:32,12:34,16:34,20:29,24:31,28:36}}),
      Object.freeze({lead:{8:65,24:60},counter:{12:68,28:67},chords:{0:[41,48,53,57],16:[43,50,55,59]},bass:{0:29,8:31,16:36,24:35}}),
    ]),
  }),
  knightScherzo: Object.freeze({
    id:'knightScherzo', genre:'Clásica', engine:'structured', label:'Scherzo del caballo',
    description:'Spiccato, pizzicato y clave en saltos asimétricos: juguetón, preciso y siempre aterrizando donde no lo esperabas.',
    stepMs:96, stepsPerSection:64, longFormMs:368000, leadInstrument:'spiccatoStrings', counterInstrument:'pizz', chordInstrument:'harpsichord', bassInstrument:'spiccatoCello',
    sections:Object.freeze([
      Object.freeze({lead:{0:64,4:67,8:71,12:65,16:69,20:72,24:66,28:69,32:67,36:71,40:74,44:68,48:72,52:76,56:71,60:67},counter:{2:52,10:55,18:57,26:54,34:55,42:59,50:60,58:55},chords:{0:[52,55,59],16:[53,57,60],32:[55,59,62],48:[52,55,60]},bass:{0:40,8:43,16:41,24:45,32:43,40:47,48:40,56:43},drums:{0:'W',16:'W',32:'W',48:'W'}}),
      Object.freeze({lead:{0:67,3:71,7:74,12:69,16:72,19:76,23:79,28:74,32:71,35:74,39:77,44:72,48:69,52:72,56:68,60:64},counter:{5:55,13:59,21:60,29:57,37:59,45:62,53:60,61:55},chords:{0:[55,59,62],16:[57,60,64],32:[59,62,65],48:[52,57,60]},bass:{0:43,8:47,16:45,24:48,32:47,40:50,48:40,56:43},drums:{0:'W',12:'H',16:'W',32:'W',44:'H',48:'W'}}),
      Object.freeze({lead:{0:76,8:74,16:72,24:71,32:69,40:67,48:66,56:64},counter:{4:64,12:62,20:60,28:59,36:57,44:55,52:54,60:52},chords:{0:[60,64,67],32:[52,55,59]},bass:{0:48,16:43,32:40,48:35},drums:{0:'W',24:'H',32:'W'}}),
      Object.freeze({lead:{0:64,4:67,8:71,12:76,16:74,20:71,24:67,28:64,32:65,36:69,40:72,44:77,48:76,52:72,56:69,60:64},counter:{6:52,22:55,38:57,54:52},chords:{0:[52,55,59],16:[55,59,62],32:[53,57,60],48:[52,55,60]},bass:{0:40,16:43,32:41,48:36},drums:{0:'W',8:'H',16:'W',24:'H',32:'W',40:'H',48:'W',56:'H'}}),
    ]),
  }),
  blackKingPavane: Object.freeze({
    id:'blackKingPavane', genre:'Clásica', engine:'structured', label:'Pavana del rey negro',
    description:'Cuerdas oscuras, órgano velado y cello procesional; dignidad antigua para un rey al que se le acaba el tablero.',
    stepMs:268, stepsPerSection:32, longFormMs:454000, leadInstrument:'strings', counterInstrument:'organ', chordInstrument:'strings', bassInstrument:'cello',
    sections:Object.freeze([
      Object.freeze({lead:{0:62,8:65,16:69,24:67},counter:{12:74,28:72},chords:{0:[50,53,57,62],16:[48,52,55,60]},bass:{0:38,16:36}}),
      Object.freeze({lead:{0:65,8:69,16:72,24:70},counter:{8:77,24:74},chords:{0:[53,57,60,65],16:[50,55,58,62]},bass:{0:41,16:38}}),
      Object.freeze({lead:{0:69,8:72,16:74,24:77},counter:{4:81,20:79},chords:{0:[57,60,64,69],16:[55,58,62,67]},bass:{0:45,16:43}}),
      Object.freeze({lead:{4:67,12:65,20:62,28:57},counter:{8:72,24:69},chords:{0:[50,53,57,62],16:[45,50,53,57]},bass:{0:38,16:33}}),
    ]),
  }),
  sixtyFourVariations: Object.freeze({
    id:'sixtyFourVariations', genre:'Piano / Minimal', engine:'structured', label:'Variaciones sobre 64 casillas',
    description:'Piano de fieltro y cello cambian una sola nota por vuelta; el tablero parece inmóvil hasta que descubres que ya no lo es.',
    stepMs:236, stepsPerSection:64, longFormMs:448000, leadInstrument:'feltGrand', counterInstrument:'cello', chordInstrument:'feltGrand', bassInstrument:'cello',
    sections:Object.freeze([
      Object.freeze({lead:{0:60,8:64,16:67,24:62,32:60,40:65,48:64,56:59},counter:{12:48,28:47,44:45,60:43},chords:{0:[48,55,60],32:[47,53,59]},bass:{0:36,32:35}}),
      Object.freeze({lead:{0:62,8:65,16:69,24:64,32:62,40:67,48:65,56:60},counter:{12:50,28:48,44:47,60:45},chords:{0:[50,57,62],32:[48,55,60]},bass:{0:38,32:36}}),
      Object.freeze({lead:{0:59,8:62,16:65,24:60,32:59,40:64,48:62,56:57},counter:{12:47,28:45,44:43,60:41},chords:{0:[47,53,59],32:[45,52,57]},bass:{0:35,32:33}}),
      Object.freeze({lead:{0:60,16:67,32:64,48:60},counter:{8:48,24:43,40:45,56:36},chords:{0:[48,55,60],32:[45,52,57]},bass:{0:36,32:33}}),
    ]),
  }),
  flagFallFive: Object.freeze({
    id:'flagFallFive', genre:'Trip-Hop / Downtempo', engine:'structured', label:'Cinco minutos para la bandera',
    description:'Piano cortado, cuerdas tensas y un pulso que se estrecha por secciones; pensar deprisa sin convertir la sala en una discoteca.',
    stepMs:126, stepsPerSection:64, longFormMs:386000, leadInstrument:'feltGrand', counterInstrument:'strings', chordInstrument:'widePad', bassInstrument:'synthbass',
    sections:Object.freeze([
      Object.freeze({lead:{0:60,12:63,24:67,36:65,48:60,60:58},counter:{18:72,42:70},chords:{0:[48,55,60],32:[46,53,58]},bass:{0:36,16:36,32:34,48:34},drums:{0:'K',14:'B',32:'S',46:'B'}}),
      Object.freeze({lead:{0:63,8:67,16:70,24:68,32:63,40:72,48:70,56:67},counter:{12:75,28:77,44:74,60:72},chords:{0:[51,58,63],32:[50,57,62]},bass:{0:39,8:39,16:34,24:34,32:38,40:38,48:36,56:36},drums:{0:'K',10:'B',16:'S',28:'B',32:'K',42:'B',48:'S',60:'B'}}),
      Object.freeze({lead:{0:67,6:70,12:74,18:72,24:67,30:75,36:74,42:70,48:67,54:65,60:63},counter:{9:79,21:77,33:82,45:79,57:75},chords:{0:[55,62,67],16:[53,60,65],32:[51,58,63],48:[50,57,62]},bass:{0:43,8:38,16:41,24:36,32:39,40:34,48:38,56:36},drums:{0:'K',6:'H',8:'B',16:'S',22:'H',24:'B',32:'K',38:'H',40:'B',48:'S',54:'H',56:'B'}}),
      Object.freeze({lead:{8:67,24:63,40:60,56:58},counter:{16:74,48:70},chords:{0:[48,55,60],32:[46,53,58]},bass:{0:36,32:34},drums:{0:'K',16:'B',32:'S'}}),
    ]),
  }),
});

function profile(spec) {
  return Object.freeze({
    preserveSectionOrder:true,
    swing:0,
    warmth:0.92,
    releaseScale:1.2,
    space:0.2,
    delayMs:220,
    chordHoldSteps:18,
    bassHoldSteps:8,
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:false,signature:true}),
    mix:Object.freeze({lead:0.56,counter:0.3,bass:0.48,chord:0.4}),
    percussion:Object.freeze({period:32,kit:'none',punch:0,pattern:Object.freeze({})}),
    ...spec,
  });
}

export const CHESS_STUDIO_COLLECTION_PROFILES = Object.freeze({
  queenSiciliana:profile({family:'queen-siciliana-chamber',harmonyPath:Object.freeze([0,0,-2,0,3,5,0]),releaseScale:1.34,space:0.23}),
  rookPassacaglia:profile({family:'rook-passacaglia-ground-bass',harmonyPath:Object.freeze([0,0,-2,-5,0]),warmth:0.78,releaseScale:1.58,space:0.3,chordHoldSteps:28,bassHoldSteps:4}),
  knightScherzo:profile({family:'knight-scherzo-spiccato',harmonyPath:Object.freeze([0,3,0,5,-2,0]),warmth:0.88,releaseScale:0.74,space:0.1,chordHoldSteps:8,bassHoldSteps:2.4,layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),percussion:Object.freeze({period:16,kit:'baroque-wood',punch:0.5,pattern:Object.freeze({0:'W',6:'H',8:'W',14:'H'})})}),
  blackKingPavane:profile({family:'black-king-pavane-procession',harmonyPath:Object.freeze([0,0,-2,0,-5,0]),warmth:0.8,releaseScale:1.5,space:0.28,chordHoldSteps:26,bassHoldSteps:18}),
  sixtyFourVariations:profile({family:'sixty-four-variations-minimal',harmonyPath:Object.freeze([0,0,2,0,-1,0]),warmth:1.02,releaseScale:1.62,space:0.27,chordHoldSteps:28,bassHoldSteps:20,finish:Object.freeze({name:'sixty-four-felt-gallery',brightness:0.8,reflectionScale:1.18,stereoWidth:0.98,driftCents:0.12}),signature:Object.freeze({instrument:'feltGrand',sections:Object.freeze([0,1,3]),everyCycles:3,repeatPeriod:64,durationSteps:7.5,volume:0.16,motif:Object.freeze({7:60,23:67,39:64,55:59})})}),
  flagFallFive:profile({family:'flag-fall-five-chamber-trip-hop',harmonyPath:Object.freeze([0,-2,0,3,-5,0]),warmth:0.66,releaseScale:0.98,space:0.15,delayMs:168,chordHoldSteps:14,bassHoldSteps:4,finish:Object.freeze({name:'flag-fall-clock-room',brightness:0.86,reflectionScale:0.96,stereoWidth:0.9,driftCents:0.42}),layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),mix:Object.freeze({lead:0.58,counter:0.36,bass:0.94,chord:0.38}),percussion:Object.freeze({period:16,kit:'legacy',punch:0.9,pattern:Object.freeze({0:'K',6:'B',8:'S',14:'B'})}),signature:Object.freeze({instrument:'feltGrand',sections:Object.freeze([0,2]),everyCycles:2,repeatPeriod:64,durationSteps:3.4,volume:0.19,motif:Object.freeze({4:60,20:63,36:67,52:58})})}),
});

export const CHESS_STUDIO_COLLECTION_IDS = Object.freeze(Object.keys(CHESS_STUDIO_COLLECTION));

export function installChessStudioCollection({ themes, options, groups, genreOrder, hiddenIds = new Set() }) {
  for (const theme of Object.values(CHESS_STUDIO_COLLECTION)) {
    if (!themes[theme.id]) themes[theme.id] = theme;
    if (!hiddenIds.has(theme.id) && !options.some((entry) => entry.id === theme.id)) {
      options.push({id:theme.id,label:theme.label,description:theme.description,genre:theme.genre});
    }
  }
  const nextGroups = genreOrder
    .map((genre) => ({genre,themes:options.filter((theme) => theme.genre === genre)}))
    .filter((group) => group.themes.length);
  groups.splice(0, groups.length, ...nextGroups);
  return CHESS_STUDIO_COLLECTION_IDS;
}

export function chessStudioCollectionFeel(theme) {
  return CHESS_STUDIO_COLLECTION_PROFILES[theme?.id] || null;
}
