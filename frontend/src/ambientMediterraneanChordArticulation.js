// Once the notes and percussion were distinct, eleven Mediterranean scores
// still changed harmony on the exact same 0/16/32/48 grid. These authored
// attack maps keep every voicing and progression intact while giving each
// arrangement its own breath, anticipations and coda cadence.

const plan = (...sections) => Object.freeze(sections.map((steps) => Object.freeze(steps)));

export const MEDITERRANEAN_CHORD_ATTACK_PLANS = Object.freeze({
  damascusBlueHour: plan([0,19,36,52], [0,14,31,49], [0,17,35,54], [0,27,51]),
  bosphorusRain: plan([0,20,38,54], [0,15,34,51], [0,18,33,50], [0,29,49]),
  casablancaLastCall: plan([0,14,29,47], [0,17,31,46], [0,12,28,45], [0,22,47]),
  cairoQuietHours: plan([0,18,35,51], [0,15,33,50], [0,20,37,53], [0,26,49]),
  nileBalcony0152: plan([0,21,39,55], [0,16,37,53], [0,19,40,56], [0,30,52]),
  aleppoAfterRain: plan([0,17,34,50], [0,13,30,48], [0,19,35,52], [0,25,50]),
  ammanVelvetRoom: plan([0,15,29,46], [0,18,32,49], [0,13,31,47], [0,23,46]),
  andalusianCoast: plan([0,13,27,42], [0,10,25,41], [0,15,30,44], [0,21,43]),
  terraceFireflies: plan([0,12,28,43], [0,15,31,46], [0,10,26,45], [0,24,45]),
  cafeFirelight: plan([0,14,30,45], [0,11,27,43], [0,16,32,48], [0,22,46]),
  malagaLastTram: plan([0,11,25,40], [0,14,29,44], [0,9,24,42], [0,20,41]),
});

export const MEDITERRANEAN_CHORD_ARTICULATION_IDS = Object.freeze(
  Object.keys(MEDITERRANEAN_CHORD_ATTACK_PLANS),
);

export function remapChordAttacks(chords, attackSteps) {
  const entries = Object.entries(chords || {}).sort(([left], [right]) => Number(left) - Number(right));
  if (!attackSteps || entries.length !== attackSteps.length) return chords;
  return Object.freeze(Object.fromEntries(entries.map(([, voicing], index) => [attackSteps[index], voicing])));
}

export function installMediterraneanChordArticulation({ themes }) {
  for (const [id, sectionPlans] of Object.entries(MEDITERRANEAN_CHORD_ATTACK_PLANS)) {
    const theme = themes[id];
    if (!theme) continue;
    theme.sections = theme.sections.map((source, index) => Object.freeze({
      ...source,
      chords:remapChordAttacks(source.chords, sectionPlans[index]),
    }));
  }
}
