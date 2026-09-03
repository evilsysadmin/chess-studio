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
      // Entrada: clarinete contenido, guitarra respondiendo al final de cada frase.
      lead:{2:62,8:65,14:67,22:70,28:67,34:65,42:62,50:60,58:62},
      counter:{5:50,17:53,31:55,45:53,61:50},
      chords:{0:[50,53,57,62],16:[48,52,55,60],32:[53,57,60,65],48:[47,50,54,59]},
      bass:{0:38,4:45,8:50,12:45,16:36,20:43,24:48,28:43,32:41,36:48,40:53,44:48,48:35,52:42,56:47,60:42},
      drums:{0:'K',6:'H',12:'B',16:'S',22:'H',28:'B',32:'K',38:'H',44:'B',48:'S',54:'H',60:'B'},
    },
    {
      // Segunda vuelta: más luminosa y cantable, sin repetir el mismo contorno.
      lead:{0:65,7:69,14:72,21:70,28:67,35:65,42:62,49:65,56:69,63:62},
      counter:{10:53,26:57,42:55,58:53},
      chords:{0:[53,57,60,65],16:[50,53,57,62],32:[57,60,64,69],48:[48,52,55,60]},
      bass:{0:41,8:48,16:38,24:45,32:45,40:52,48:36,56:43},
      drums:{0:'K',8:'H',16:'S',24:'B',32:'K',40:'H',48:'S',56:'B'},
    },
    {
      // Puente respirado: menos percusión, Rhodes y bajo sostienen una charla corta.
      lead:{4:60,16:64,28:67,40:65,52:62},
      counter:{12:48,30:52,46:50,60:47},
      chords:{0:[48,52,55,60],16:[45,50,53,57],32:[50,53,57,62],48:[43,48,52,55]},
      bass:{0:36,8:43,16:33,24:40,32:38,40:45,48:31,56:38},
      drums:{0:'K',16:'S',32:'K',48:'S'},
    },
    {
      // Cierre: recupera el motivo principal y lo abre una tercera arriba.
      lead:{2:67,10:70,18:72,26:74,34:70,42:67,50:65,58:62},
      counter:{6:55,22:58,38:57,54:53},
      chords:{0:[55,59,62,67],16:[52,57,60,64],32:[50,55,58,63],48:[53,57,60,65]},
      bass:{0:43,8:50,16:40,24:47,32:38,40:45,48:41,56:48},
      drums:{0:'K',8:'B',16:'S',24:'H',32:'K',40:'B',48:'S',56:'H'},
    },
  ],
});

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

  return themes.tangierSmoke;
}
