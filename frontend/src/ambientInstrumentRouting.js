// A section can hand the melody to another player. The overall production
// profile supplies the default, but must not erase that written hand-off.
//
// The Mediterranean scores deliberately keep their regional plucked voices as
// sparse signatures. Their continuous lead/counter lanes, however, are routed
// through the physically-modelled nylon string when the authored instrument is
// one of the older oscillator plucks. This avoids stacking a synthetic regional
// timbre for minutes at a time while preserving the tune and occasional colour.
const ORGANIC_MEDITERRANEAN_THEME_IDS = new Set([
  'alexandria241',
  'cairo0047',
  'cairoQuietHours',
  'cairoRedLantern',
  'cairoBlueNote0211',
  'nileBalcony0152',
  'beirut0113',
  'beirutRooftop0412',
  'beirutNightTaxi',
  'beirutHarbor2340',
  'damascusBlueHour',
  'aleppoAfterRain',
  'ammanVelvetRoom',
  'ammanLateTable0303',
  'medinaBlueSmoke',
  'istanbul0326',
  'istanbulBackgammon',
  'bosphorusRain',
  'oudTrench',
]);

const ORGANIC_IBERIAN_THEME_IDS = new Set(['andalusianCoast', 'cadizLanterns']);
const ORGANIC_LATIN_THEME_IDS = new Set(['havana205']);
const OSCILLATOR_PLUCKS = new Set(['oudJazz', 'qanun', 'buzuq']);

export const ORGANIC_MEDITERRANEAN_ROUTING_IDS = Object.freeze([...ORGANIC_MEDITERRANEAN_THEME_IDS]);
export const ORGANIC_IBERIAN_ROUTING_IDS = Object.freeze([...ORGANIC_IBERIAN_THEME_IDS]);
export const ORGANIC_LATIN_ROUTING_IDS = Object.freeze([...ORGANIC_LATIN_THEME_IDS]);

function organicMediterraneanInstrument(theme, instrument, lane) {
  if (!ORGANIC_MEDITERRANEAN_THEME_IDS.has(theme?.id)) return instrument;
  if (lane !== 'lead' && lane !== 'counter') return instrument;
  if (!OSCILLATOR_PLUCKS.has(instrument)) return instrument;
  return 'nylonGuitar';
}

function organicIberianInstrument(theme, instrument, lane) {
  if (!ORGANIC_IBERIAN_THEME_IDS.has(theme?.id)) return instrument;
  if (lane !== 'lead' && lane !== 'counter') return instrument;
  // Iberian arrangements already lean on a modelled nylon lead. Older regional
  // oscillator plucks still make a useful sparse accent, but as a continuous
  // answering lane they expose their fast attack/bright partials. Use the darker
  // modelled jazz body for that long role and keep the regional voice for hooks.
  if (OSCILLATOR_PLUCKS.has(instrument)) return 'jazzGuitar';
  return instrument;
}

function organicLatinInstrument(theme, instrument, lane) {
  if (!ORGANIC_LATIN_THEME_IDS.has(theme?.id)) return instrument;
  if (lane !== 'lead' && lane !== 'counter') return instrument;
  // Havana's old bandoneon preset is a compact oscillator reed. In a short,
  // repeated line its hard upper partials read as a cheap "chiu-chiu". Keep
  // the written melody but hand the continuous voice to the already modelled
  // nylon string; sparse colour can still come from the arrangement around it.
  if (instrument === 'bandoneon') return 'nylonGuitar';
  return instrument;
}

export function structuredSectionInstrument(theme, feel, section, lane) {
  const key = `${lane}Instrument`;
  const authored = section?.[key];
  let instrument = authored || feel?.[key] || theme?.[key] || (lane === 'counter' ? theme?.leadInstrument : undefined);

  // Keep the authored player while applying the same timbral polish as the
  // default instrument. Otherwise a return to guitar2/brass sounds like an
  // unmastered preset in the middle of an otherwise finished arrangement.
  if (authored === 'brass' && ['Smooth Jazz', 'Jazz / Mediterráneo'].includes(theme?.genre)) instrument = 'mutedHorn';
  if (authored === 'epiano' && feel?.[key] === 'rhodesWarm') instrument = 'rhodesWarm';
  if (authored === 'guitar2') {
    if (theme?.genre === 'Smooth Jazz' || [feel?.leadInstrument, feel?.counterInstrument].includes('jazzGuitar')) instrument = 'jazzGuitar';
    if (theme?.genre === 'Bossa / Latin Lounge' || [feel?.leadInstrument, feel?.counterInstrument].includes('nylonGuitar')) instrument = 'nylonGuitar';
  }

  instrument = organicMediterraneanInstrument(theme, instrument, lane);
  instrument = organicIberianInstrument(theme, instrument, lane);
  return organicLatinInstrument(theme, instrument, lane);
}
