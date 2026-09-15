const ENERGY_PROFILES = Object.freeze({
  neonKnight: Object.freeze({
    leadInstrument:'analogLead', counterInstrument:'stormPluck', chordInstrument:'widePad', bassInstrument:'synthbass',
    percussion:Object.freeze({period:16,kit:'neon-drive',punch:1.16,pattern:Object.freeze({0:'K',2:'H',4:'K',6:'H',8:'S',10:'H',12:'K',14:'H'})}),
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    signature:Object.freeze({instrument:'analogLead',sections:Object.freeze([0,1]),everyCycles:2,repeatPeriod:64,durationSteps:3.2,volume:0.19,motif:Object.freeze({4:64,20:71,36:67,52:76})}),
  }),
  midnightArcade: Object.freeze({
    leadInstrument:'arcadePulse', counterInstrument:'glass', chordInstrument:'analogLead', bassInstrument:'synthbass',
    percussion:Object.freeze({period:16,kit:'arcade-break',punch:1.22,pattern:Object.freeze({0:'K',3:'H',4:'S',7:'B',8:'K',11:'H',12:'S',15:'B'})}),
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    signature:Object.freeze({instrument:'arcadePulse',sections:Object.freeze([0,1]),everyCycles:2,repeatPeriod:64,durationSteps:2.6,volume:0.18,motif:Object.freeze({3:72,19:79,35:75,51:84})}),
  }),
  neonSiege: Object.freeze({
    leadInstrument:'powerGuitar', counterInstrument:'anthemLead', chordInstrument:'powerPad', bassInstrument:'synthbass',
    chordHoldSteps:6, bassHoldSteps:1.35,
    counterGainScale:0.82,
    mix:Object.freeze({lead:1.12,counter:0.70,bass:1.08,chord:0.22}),
    finish:Object.freeze({brightness:1.14,driftCents:3.5}),
    percussion:Object.freeze({period:16,kit:'synth-metal-anthem',punch:1.42,pattern:Object.freeze({0:'K',2:'K',3:'H',4:'S',6:'K',7:'H',8:'K',10:'K',12:'S',14:'K',15:'M'})}),
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    signature:Object.freeze({instrument:'anthemLead',sections:Object.freeze([1,2,3]),everyCycles:2,repeatPeriod:64,durationSteps:3.0,volume:0.19,motif:Object.freeze({4:76,20:83,36:79,52:88})}),
  }),
  overclockedKnight: Object.freeze({
    leadInstrument:'anthemLead', counterInstrument:'powerGuitar', chordInstrument:'widePad', bassInstrument:'synthbass',
    chordHoldSteps:7, bassHoldSteps:1.45,
    counterGainScale:1.0,
    mix:Object.freeze({lead:0.62,counter:0.92,bass:1.06,chord:0.20}),
    finish:Object.freeze({brightness:1.12,driftCents:3}),
    percussion:Object.freeze({period:12,kit:'synth-metal-gallop',punch:1.36,pattern:Object.freeze({0:'K',2:'H',3:'K',5:'K',6:'S',8:'H',9:'K',10:'M',11:'K'})}),
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    signature:Object.freeze({instrument:'overdriveGuitar',sections:Object.freeze([0,1]),everyCycles:2,repeatPeriod:48,durationSteps:2.8,volume:0.19,motif:Object.freeze({5:59,17:62,29:58,41:64})}),
  }),
  reactorGambit: Object.freeze({
    leadInstrument:'powerGuitar', counterInstrument:'neonBrass', chordInstrument:'powerPad', bassInstrument:'synthbass',
    chordHoldSteps:8, bassHoldSteps:1.7,
    mix:Object.freeze({lead:1.08,counter:0.66,bass:1.06,chord:0.24}),
    finish:Object.freeze({brightness:1.10,driftCents:2.5}),
    percussion:Object.freeze({period:16,kit:'synth-metal-cinematic',punch:1.34,pattern:Object.freeze({0:'K',3:'H',4:'K',7:'M',8:'S',10:'H',12:'K',14:'M',15:'K'})}),
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    signature:Object.freeze({instrument:'neonBrass',sections:Object.freeze([1,2,4]),everyCycles:2,repeatPeriod:64,durationSteps:3.4,volume:0.20,motif:Object.freeze({5:64,21:71,37:76,53:69})}),
  }),
  checkEngine: Object.freeze({
    percussion:Object.freeze({period:16,kit:'check-engine-drive',punch:1.24,pattern:Object.freeze({0:'K',2:'H',5:'B',8:'S',10:'K',13:'H',15:'M'})}),
  }),
});

export const ENERGY_PRODUCTION_IDS = Object.freeze(Object.keys(ENERGY_PROFILES));

export function withEnergyProduction(theme, feel) {
  const profile = ENERGY_PROFILES[theme?.id];
  if (!profile || !feel) return feel;
  return Object.freeze({ ...feel, ...profile });
}

export { ENERGY_PROFILES };
