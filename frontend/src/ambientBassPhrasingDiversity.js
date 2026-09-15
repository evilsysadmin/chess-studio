// Bass motion is part of a theme's identity. These plans break the remaining
// exact onset families without touching a single pitch: slow scores breathe,
// groove music leans around the beat, and rock/electronic lines propel forward.

const plan = (...sections) => Object.freeze(sections.map((steps) => Object.freeze(steps)));

export const BASS_ATTACK_PLANS = Object.freeze({
  cathedral: plan([0,18], [0,15]),
  lateEndgame: plan([0,14], [0,19]),
  orbitalMonastery: plan([0,21], [0,13]),
  glassAsh: plan([0,17], [0,22]),
  winterLibrary: plan([0,20], [0,16]),
  queenRequiem: plan([0,22], [0,18]),

  concreteRain: plan([0,7,15,24,32,39,48,56], [0,9,17,25,34,42,50,59]),
  velvetStatic: plan([0,10,18,27,35,43,52,60], [0,8,19,26,36,45,53,61]),
  queenBossa: plan([0,6,14,22,31,38,46,55], [0,7,16,23,32,40,49,57]),
  pawnMarshal: plan([0,6,12,19,27,34,41,49], [0,7,13,21,28,36,44,53]),
  cafeGambit213: plan([0,8,15,23,31,40,48,57], [0,7,17,24,34,41,50,58]),
  oudTrench: plan([0,5,14,21,30,38,47,54], [0,7,15,26,33,42,50,60]),

  gambit: plan([0,3,7,11,15,19,23,27]),
  casablanca: plan([0,5,8,13,16,20,25,29]),
  electricDesert: plan([0,3,8,12,15,20,24,28]),
  storm: plan([0,2,6,10,14,17,22,27]),
  machineRoom: plan([0,4,7,11,16,18,23,29]),

  march: plan([0,7,15,24]),
  clockwork: plan([0,9,16,25]),
  velvet: plan([0,6,17,23]),

  moonOnsen: plan([0,18], [0,22], [0,16]),
  nocturnalQuartet: plan([0,17], [0,21], [0,24]),
  abyssalArchive: plan([0,23], [0,18], [0,26]),
  verticalRainPiano: plan([0,19], [0,24], [0,15]),
  blackArchive: plan([0,25], [0,17], [0,22]),

  nightFreight: plan([0,5,11,17,24,29,36,43], [0,6,13,19,25,31,38,45]),
  rookGarage: plan([0,4,10,16,22,28,35,42], [0,7,12,18,25,30,37,44]),
  desertDriveRock: plan([0,6,11,18,24,32,38,45], [0,5,13,19,26,31,39,46]),

  cairoBlueNote0211: plan(
    [0,7,15,23,32,40,49,57], [0,9,17,25,34,42,51,59], [0,17,33,50],
  ),
  cordobaRooftop0026: plan(
    [0,6,14,22,30,39,47,55], [0,8,16,27,35,43,52,60], [0,15,31,48],
  ),
  ammanLateTable0303: plan(
    [0,5,13,21,29,37,46,54], [0,7,18,26,34,44,52,61], [0,19,35,53],
  ),
});

export const BASS_PHRASING_DIVERSITY_IDS = Object.freeze(Object.keys(BASS_ATTACK_PLANS));

export function remapBassAttacks(bass, attackSteps) {
  const entries = Object.entries(bass || {}).sort(([left], [right]) => Number(left) - Number(right));
  if (!attackSteps || entries.length !== attackSteps.length) return bass;
  return Object.freeze(Object.fromEntries(entries.map(([, note], index) => [attackSteps[index], note])));
}

export function installBassPhrasingDiversity({ themes }) {
  for (const [id, sectionPlans] of Object.entries(BASS_ATTACK_PLANS)) {
    const theme = themes[id];
    if (!theme) continue;
    theme.sections = theme.sections.map((source, index) => Object.freeze({
      ...source,
      bass:remapBassAttacks(source.bass, sectionPlans[index]),
    }));
  }
}
