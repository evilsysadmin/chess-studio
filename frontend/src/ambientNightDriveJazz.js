// Night-drive jazz/funk: original Smooth Jazz compositions that favour pocket,
// Rhodes and clean guitar over constant saxophone. Built as a small isolated
// songbook so adding radio character does not enlarge the legacy profile table.

export const NIGHT_DRIVE_JAZZ_GENRE = 'Smooth Jazz';

function freezeLine(line) {
  return Object.freeze({ ...line });
}

function pocketChords(progression, offsets = [2, 10]) {
  const line = {};
  progression.forEach((chord, bar) => {
    offsets.forEach((offset) => { line[(bar * 16) + offset] = Object.freeze([...chord]); });
  });
  return freezeLine(line);
}

function pocketBass(roots, offsets = [0, 5, 8, 11, 14]) {
  const line = {};
  roots.forEach((root, bar) => {
    offsets.forEach((offset, index) => {
      const walkingColour = index === 1 ? 7 : index === 3 ? 10 : 0;
      line[(bar * 16) + offset] = root + walkingColour;
    });
  });
  return freezeLine(line);
}

function section({ lead, counter, progression, roots, chordOffsets, bassOffsets }) {
  return Object.freeze({
    lead: freezeLine(lead),
    counter: freezeLine(counter),
    chords: pocketChords(progression, chordOffsets),
    bass: pocketBass(roots, bassOffsets),
  });
}

export const NIGHT_DRIVE_JAZZ_THEMES = Object.freeze({
  neonBoulevard: Object.freeze({
    id:'neonBoulevard', genre:NIGHT_DRIVE_JAZZ_GENRE, engine:'structured', label:'Night drive · bulevar de neón',
    description:'Rhodes con pocket, bajo profundo y guitarra jazz limpia. Funk nocturno contenido: carretera mojada, semáforos vacíos y cero saxo de ascensor.',
    stepMs:150, stepsPerSection:64, longFormMs:438000,
    leadInstrument:'rhodesWarm', counterInstrument:'jazzGuitar', chordInstrument:'rhodesWarm', bassInstrument:'synthbass',
    sections:Object.freeze([
      section({
        lead:{2:64,7:67,11:71,16:72,22:71,27:67,31:64,35:67,40:71,45:74,50:72,56:71,61:67},
        counter:{5:76,13:74,21:79,29:76,38:74,46:81,54:79,62:74},
        progression:[[48,52,55,59],[45,48,52,57],[50,53,57,60],[43,47,50,55]], roots:[36,33,38,31],
      }),
      section({
        lead:{1:67,6:71,10:72,15:76,20:74,25:71,30:69,34:67,39:71,44:76,49:79,54:76,59:74,63:71},
        counter:{4:79,12:76,19:74,28:81,36:79,45:76,52:83,60:79},
        progression:[[50,53,57,60],[43,47,50,55],[48,52,55,59],[45,48,52,57]], roots:[38,31,36,33],
      }),
      section({
        lead:{3:64,9:67,15:71,22:69,28:67,35:64,42:67,49:71,55:72,62:67},
        counter:{7:76,19:74,31:79,43:76,55:74},
        progression:[[48,52,55,59],[45,48,52,57],[43,47,50,55],[48,52,55,59]], roots:[36,33,31,36],
        chordOffsets:[2,10], bassOffsets:[0,5,8,14],
      }),
    ]),
  }),

  lastExitAfterHours: Object.freeze({
    id:'lastExitAfterHours', genre:NIGHT_DRIVE_JAZZ_GENRE, engine:'structured', label:'Night drive · última salida 01:17',
    description:'Guitarra hueca, Rhodes y bajo eléctrico con batería de escobillas. La trompeta apagada aparece sólo para responder al hook, no para empapelar el tema.',
    stepMs:152, stepsPerSection:64, longFormMs:444000,
    leadInstrument:'jazzGuitar', counterInstrument:'mutedHorn', chordInstrument:'rhodesWarm', bassInstrument:'synthbass',
    sections:Object.freeze([
      section({
        lead:{2:69,6:72,11:76,17:74,23:72,28:69,34:67,39:69,44:72,50:77,56:76,62:72},
        counter:{13:81,29:79,45:84,61:81},
        progression:[[45,48,52,57],[41,45,48,52],[48,52,55,59],[43,47,50,55]], roots:[33,29,36,31],
      }),
      section({
        lead:{1:72,5:76,10:79,15:81,21:79,26:76,31:74,36:72,41:76,47:84,52:81,58:79,63:76},
        counter:{11:84,27:81,43:86,59:84},
        progression:[[48,52,55,59],[43,47,50,55],[45,48,52,57],[41,45,48,52]], roots:[36,31,33,29],
      }),
      section({
        lead:{4:69,10:72,17:76,24:74,31:72,38:69,45:72,52:76,59:72},
        counter:{15:81,39:79,63:81},
        progression:[[45,48,52,57],[41,45,48,52],[43,47,50,55],[45,48,52,57]], roots:[33,29,31,33],
        chordOffsets:[2,10], bassOffsets:[0,5,8,11,14],
      }),
    ]),
  }),
});

export const NIGHT_DRIVE_JAZZ_THEME_IDS = Object.freeze(Object.keys(NIGHT_DRIVE_JAZZ_THEMES));

export const NIGHT_DRIVE_JAZZ_PROFILES = Object.freeze({
  neonBoulevard: Object.freeze({
    family:'night-drive-rhodes-funk-pocket', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,0,-2,3,0,5,-2,0]), swing:0.105, warmth:0.98, releaseScale:1.02, space:0.09, delayMs:112,
    leadInstrument:'rhodesWarm', counterInstrument:'jazzGuitar', chordInstrument:'rhodesWarm', bassInstrument:'synthbass',
    chordHoldSteps:5.5, bassHoldSteps:2.1,
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    mix:Object.freeze({lead:0.58,counter:0.28,bass:1.02,chord:0.46}),
    percussion:Object.freeze({period:16,kit:'brush-jazz',punch:0.72,pattern:Object.freeze({0:'K',3:'H',6:'B',8:'S',11:'H',14:'B'})}),
    signature:Object.freeze({instrument:'jazzGuitar',sections:Object.freeze([0,1]),everyCycles:3,repeatPeriod:64,durationSteps:3.6,volume:0.15,motif:Object.freeze({7:76,23:79,39:74,55:81})}),
  }),
  lastExitAfterHours: Object.freeze({
    family:'night-drive-hollowbody-last-exit', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,-2,0,5,0,3,0]), swing:0.12, warmth:0.92, releaseScale:1.08, space:0.11, delayMs:138,
    leadInstrument:'jazzGuitar', counterInstrument:'mutedHorn', chordInstrument:'rhodesWarm', bassInstrument:'synthbass',
    chordHoldSteps:6.5, bassHoldSteps:2.3,
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    mix:Object.freeze({lead:0.62,counter:0.18,bass:1.00,chord:0.48}),
    percussion:Object.freeze({period:24,kit:'brush-jazz',punch:0.68,pattern:Object.freeze({0:'B',6:'H',12:'S',18:'H',22:'B'})}),
    signature:Object.freeze({instrument:'mutedHorn',sections:Object.freeze([0,1]),everyCycles:3,repeatPeriod:64,durationSteps:5.0,volume:0.13,motif:Object.freeze({13:81,29:79,45:84,61:81})}),
  }),
});

export function installNightDriveJazz({ themes, options, groups, genreOrder }) {
  for (const theme of Object.values(NIGHT_DRIVE_JAZZ_THEMES)) {
    if (!themes[theme.id]) themes[theme.id] = theme;
    if (!options.some((entry) => entry.id === theme.id)) {
      options.push({ id:theme.id, label:theme.label, description:theme.description, genre:theme.genre });
    }
  }

  const nextGroups = genreOrder
    .map((genre) => ({ genre, themes:options.filter((theme) => theme.genre === genre) }))
    .filter((group) => group.themes.length);
  groups.splice(0, groups.length, ...nextGroups);
  return NIGHT_DRIVE_JAZZ_THEME_IDS;
}

export function withNightDriveJazzProduction(theme, feel) {
  const profile = NIGHT_DRIVE_JAZZ_PROFILES[theme?.id];
  if (!profile) return feel;
  return Object.freeze({ ...(feel || {}), ...profile });
}
