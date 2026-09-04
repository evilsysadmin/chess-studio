// Recomposiciones pedidas por el usuario que conservan id/label publicados.
// La identidad del dial permanece estable; cambia la canción que hay debajo.

export const TANGIER_SMOKE_RECOMPOSITION = Object.freeze({
  id:'tangierSmoke',
  label:'Tánger · humo',
  description:'Clarinete seco, guitarra nocturna, Rhodes y walking bass; club de Tánger con más fraseo, más movimiento y bastante menos niebla musical.',
  engine:'structured',
  stepMs:146,
  stepsPerSection:64,
  longFormMs:448000,
  leadInstrument:'clarinet',
  counterInstrument:'guitar2',
  chordInstrument:'rhodesWarm',
  bassInstrument:'uprightBass',
  sections:[
    {
      lead:{2:62,8:65,14:67,22:70,28:67,34:65,42:62,50:60,58:62},
      counter:{5:50,17:53,31:55,45:53,61:50},
      chords:{0:[50,53,57,62],16:[48,52,55,60],32:[53,57,60,65],48:[47,50,54,59]},
      bass:{0:38,4:45,8:50,12:45,16:36,20:43,24:48,28:43,32:41,36:48,40:53,44:48,48:35,52:42,56:47,60:42},
      drums:{0:'K',6:'H',12:'B',16:'S',22:'H',28:'B',32:'K',38:'H',44:'B',48:'S',54:'H',60:'B'},
    },
    {
      lead:{0:65,7:69,14:72,21:70,28:67,35:65,42:62,49:65,56:69,63:62},
      counter:{10:53,26:57,42:55,58:53},
      chords:{0:[53,57,60,65],16:[50,53,57,62],32:[57,60,64,69],48:[48,52,55,60]},
      bass:{0:41,8:48,16:38,24:45,32:45,40:52,48:36,56:43},
      drums:{0:'K',8:'H',16:'S',24:'B',32:'K',40:'H',48:'S',56:'B'},
    },
    {
      lead:{4:60,16:64,28:67,40:65,52:62},
      counter:{12:48,30:52,46:50,60:47},
      chords:{0:[48,52,55,60],16:[45,50,53,57],32:[50,53,57,62],48:[43,48,52,55]},
      bass:{0:36,8:43,16:33,24:40,32:38,40:45,48:31,56:38},
      drums:{0:'K',16:'S',32:'K',48:'S'},
    },
    {
      lead:{2:67,10:70,18:72,26:74,34:70,42:67,50:65,58:62},
      counter:{6:55,22:58,38:57,54:53},
      chords:{0:[55,59,62,67],16:[52,57,60,64],32:[50,55,58,63],48:[53,57,60,65]},
      bass:{0:43,8:50,16:40,24:47,32:38,40:45,48:41,56:48},
      drums:{0:'K',8:'B',16:'S',24:'H',32:'K',40:'B',48:'S',56:'H'},
    },
  ],
});

// La expansión transversal nació con timbres y grooves suficientemente distintos,
// pero varias melodías compartían el mismo arco ascendente/descendente. Este mapa
// reescribe sólo lead/counter: conserva batería, bajo, acordes, mezcla y duración.
export const RADIO_MATTHIAS_MELODIC_REWRITES = Object.freeze({
  velvetKnight0237: Object.freeze({
    description:'Smooth jazz nocturno con una línea cromática perezosa, respuestas de trompeta y más conversación que escala disfrazada.',
    melodySections:Object.freeze([
      Object.freeze({lead:Object.freeze({2:64,11:66,19:69,27:71,38:70,46:67,55:65,62:68}),counter:Object.freeze({7:75,23:73,41:76,57:72})}),
      Object.freeze({lead:Object.freeze({4:67,13:70,21:72,30:69,37:74,45:71,53:68,60:66,63:69}),counter:Object.freeze({9:79,25:75,43:77,59:73})}),
    ]),
  }),
  bishopSunset: Object.freeze({
    description:'Tropical house de nylon y marimba con motivo sincopado propio, saltos luminosos y respuesta de playa nocturna sin plantilla de pop genérica.',
    melodySections:Object.freeze([
      Object.freeze({lead:Object.freeze({2:67,9:69,15:71,23:74,31:71,37:69,45:76,53:74,61:69}),counter:Object.freeze({6:79,18:83,34:78,50:81})}),
      Object.freeze({lead:Object.freeze({4:71,10:69,18:74,26:76,34:72,42:79,50:76,58:71,63:74}),counter:Object.freeze({13:83,29:79,45:84,61:81})}),
    ]),
  }),
  checkEngine: Object.freeze({
    description:'Synthwave oscuro construido alrededor de quintas, octavas y ostinatos repetidos; menos escala heroica, más motor nocturno de verdad.',
    melodySections:Object.freeze([
      Object.freeze({lead:Object.freeze({0:64,8:64,16:71,24:67,32:72,40:67,48:76,56:71}),counter:Object.freeze({4:52,12:59,20:55,28:60,36:57,44:64,52:59,60:67})}),
      Object.freeze({lead:Object.freeze({0:67,8:74,16:71,24:79,32:74,40:71,48:83,56:76}),counter:Object.freeze({4:55,12:62,20:59,28:67,36:62,44:59,52:71,60:64})}),
      Object.freeze({lead:Object.freeze({4:76,12:71,20:79,28:74,36:83,44:76,52:72,60:79}),counter:Object.freeze({8:64,24:59,40:67,56:62})}),
    ]),
  }),
  rookAfterHours: Object.freeze({
    description:'Post-rock de notas largas y arcos amplios: la guitarra deja espacio, el cello contesta y el clímax crece sin copiar el synthwave.',
    melodySections:Object.freeze([
      Object.freeze({lead:Object.freeze({0:64,12:71,24:69,36:76,48:72,60:67}),counter:Object.freeze({6:52,22:55,38:50,54:57})}),
      Object.freeze({lead:Object.freeze({0:67,10:72,18:71,30:79,42:74,50:76,60:69}),counter:Object.freeze({6:55,26:59,46:57})}),
      Object.freeze({lead:Object.freeze({4:72,16:79,28:76,40:84,52:81,60:74}),counter:Object.freeze({10:57,34:64,58:60})}),
    ]),
  }),
  lofiPawnNotebook: Object.freeze({
    description:'Lo-fi íntimo de motivo descendente, silencios largos y pequeñas recuperaciones; parece una idea escrita a lápiz, no smooth jazz con polvo.',
    melodySections:Object.freeze([
      Object.freeze({lead:Object.freeze({3:64,12:62,20:59,30:61,39:57,48:60,57:55,63:59}),counter:Object.freeze({8:72,24:69,40:67,56:64})}),
      Object.freeze({lead:Object.freeze({5:67,14:64,22:62,31:65,40:60,49:63,58:59}),counter:Object.freeze({10:74,26:71,42:69,60:67})}),
    ]),
  }),
  rookVeranda: Object.freeze({
    description:'Bossa seca con frase cromática y síncopas cortas; guitarra y Rhodes se cruzan alrededor del pulso en vez de subir y bajar por la misma escalera.',
    melodySections:Object.freeze([
      Object.freeze({lead:Object.freeze({0:64,7:65,13:67,20:66,27:69,35:67,43:64,50:62,58:63,63:65}),counter:Object.freeze({10:55,22:59,34:57,46:60,60:55})}),
      Object.freeze({lead:Object.freeze({3:67,11:69,18:68,26:72,34:71,42:67,49:65,57:66,63:62}),counter:Object.freeze({14:59,30:62,46:58,61:57})}),
    ]),
  }),
  bishopCircuit: Object.freeze({
    description:'Electrónica angular de intervalos abiertos y respuestas asimétricas; conserva el pulso oscuro pero abandona definitivamente la escalera melódica común.',
    melodySections:Object.freeze([
      Object.freeze({lead:Object.freeze({0:60,5:67,13:61,20:72,29:64,37:70,46:57,54:69,63:62}),counter:Object.freeze({7:76,18:73,31:81,44:74,58:83})}),
      Object.freeze({lead:Object.freeze({3:64,9:59,17:71,25:62,33:76,41:68,49:73,57:61,63:67}),counter:Object.freeze({6:79,22:75,38:84,54:77})}),
    ]),
  }),
});

export const RADIO_MATTHIAS_MELODIC_REWRITE_IDS = Object.freeze(Object.keys(RADIO_MATTHIAS_MELODIC_REWRITES));

function installMelodicRewrite({ themes, options, id, rewrite }) {
  const previous = themes[id];
  if (!previous) return;

  previous.sections = previous.sections.map((section, index) => {
    const melody = rewrite.melodySections[index];
    return melody ? { ...section, ...melody } : section;
  });
  previous.description = rewrite.description;

  const option = options.find((entry) => entry.id === id);
  if (option) option.description = rewrite.description;
}

export function installRadioMatthiasRecompositions({ themes, options }) {
  const previous = themes.tangierSmoke || {};
  themes.tangierSmoke = {
    ...previous,
    ...TANGIER_SMOKE_RECOMPOSITION,
  };

  const option = options.find((entry) => entry.id === 'tangierSmoke');
  if (option) {
    option.label = TANGIER_SMOKE_RECOMPOSITION.label;
    option.description = TANGIER_SMOKE_RECOMPOSITION.description;
  }

  for (const [id, rewrite] of Object.entries(RADIO_MATTHIAS_MELODIC_REWRITES)) {
    installMelodicRewrite({ themes, options, id, rewrite });
  }

  return themes.tangierSmoke;
}