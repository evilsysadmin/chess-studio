const ELECTRONIC_PROFILES = Object.freeze({
  electricDesert: Object.freeze({
    family: 'electric-desert-analog-dust',
    leadInstrument: 'analogLead', chordInstrument: 'widePad', bassInstrument: 'synthbass',
    warmth: 0.86, releaseScale: 1.04, space: 0.16, delayMs: 176,
    layers: Object.freeze({ lead:true, counter:false, chords:true, bass:true, drums:true, signature:true }),
    percussion: Object.freeze({ period:16, kit:'desert-electronic', punch:1.04, pattern:Object.freeze({0:'K',3:'H',6:'S',8:'K',11:'H',14:'S'}) }),
    signature: Object.freeze({ instrument:'analogLead', sections:Object.freeze([0,1]), everyCycles:2, repeatPeriod:64, durationSteps:3.8, volume:0.20, motif:Object.freeze({6:64,22:71,38:67,54:74}) }),
  }),
  storm: Object.freeze({
    family: 'storm-fm-breaks-pressure',
    leadInstrument: 'stormPluck', chordInstrument: 'stormPad', bassInstrument: 'synthbass',
    warmth: 0.74, releaseScale: 0.82, space: 0.12, delayMs: 104,
    layers: Object.freeze({ lead:true, counter:false, chords:true, bass:true, drums:true, signature:true }),
    percussion: Object.freeze({ period:12, kit:'storm-breaks', punch:1.18, pattern:Object.freeze({0:'K',2:'H',4:'S',7:'K',9:'H',11:'S'}) }),
    signature: Object.freeze({ instrument:'stormPluck', sections:Object.freeze([0,1]), everyCycles:2, repeatPeriod:48, durationSteps:2.8, volume:0.19, motif:Object.freeze({3:72,15:79,27:75,39:82}) }),
  }),
  analogBunker: Object.freeze({
    family: 'analog-bunker-subterranean-sequencer',
    leadInstrument: 'subPulse', chordInstrument: 'analogLead', bassInstrument: 'synthbass',
    warmth: 0.76, releaseScale: 0.90, space: 0.075, delayMs: 92,
    layers: Object.freeze({ lead:true, counter:false, chords:false, bass:true, drums:true, signature:true }),
    percussion: Object.freeze({ period:20, kit:'bunker-industrial', punch:1.20, pattern:Object.freeze({0:'K',4:'H',7:'M',10:'S',14:'K',17:'H'}) }),
    signature: Object.freeze({ instrument:'subPulse', sections:Object.freeze([0,2]), everyCycles:2, repeatPeriod:64, durationSteps:3.0, volume:0.18, motif:Object.freeze({5:52,19:55,37:51,53:58}) }),
  }),
  nightFreight: Object.freeze({
    family: 'night-freight-metal-half-time',
    leadInstrument: 'metallic', chordInstrument: 'widePad', bassInstrument: 'synthbass',
    warmth: 0.80, releaseScale: 1.12, space: 0.14, delayMs: 188,
    layers: Object.freeze({ lead:true, counter:false, chords:true, bass:true, drums:true, signature:true }),
    percussion: Object.freeze({ period:24, kit:'freight-half-time', punch:1.14, pattern:Object.freeze({0:'K',5:'H',8:'M',12:'S',18:'K',22:'H'}) }),
    signature: Object.freeze({ instrument:'metallic', sections:Object.freeze([0,1]), everyCycles:3, repeatPeriod:64, durationSteps:3.4, volume:0.17, motif:Object.freeze({7:60,23:67,39:62,55:70}) }),
  }),
  bishopCircuit: Object.freeze({
    family: 'bishop-circuit-glitch-counterpoint',
    percussion: Object.freeze({ period:16, kit:'circuit-glitch', punch:1.10, pattern:Object.freeze({0:'K',2:'H',5:'B',8:'S',11:'H',14:'M'}) }),
  }),
});

export const ELECTRONIC_PRODUCTION_IDS = Object.freeze(Object.keys(ELECTRONIC_PROFILES));

export function withElectronicProduction(theme, feel) {
  const profile = ELECTRONIC_PROFILES[theme?.id];
  if (!profile || !feel) return feel;
  return Object.freeze({ ...feel, ...profile });
}

export { ELECTRONIC_PROFILES };
