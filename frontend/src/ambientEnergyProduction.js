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
    leadInstrument:'overdriveGuitar', counterInstrument:'stormPluck', chordInstrument:'analogLead', bassInstrument:'synthbass',
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    signature:Object.freeze({instrument:'overdriveGuitar',sections:Object.freeze([0,1]),everyCycles:2,repeatPeriod:64,durationSteps:2.4,volume:0.20,motif:Object.freeze({2:52,18:55,34:59,50:57})}),
  }),
  overclockedKnight: Object.freeze({
    leadInstrument:'subPulse', counterInstrument:'overdriveGuitar', chordInstrument:'widePad', bassInstrument:'synthbass',
    layers:Object.freeze({lead:true,counter:true,chords:true,bass:true,drums:true,signature:true}),
    signature:Object.freeze({instrument:'overdriveGuitar',sections:Object.freeze([0,1]),everyCycles:2,repeatPeriod:48,durationSteps:2.8,volume:0.19,motif:Object.freeze({5:59,17:62,29:58,41:64})}),
  }),
  reactorGambit: Object.freeze({
    percussion:Object.freeze({period:16,kit:'reactor-drive',punch:1.26,pattern:Object.freeze({0:'K',3:'H',4:'K',8:'S',10:'H',12:'K',14:'M'})}),
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
