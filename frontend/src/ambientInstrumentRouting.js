// A section can hand the melody to another player. The overall production
// profile supplies the default, but must not erase that written hand-off.
export function structuredSectionInstrument(theme, feel, section, lane) {
  const key = `${lane}Instrument`;
  const authored = section?.[key];
  if (!authored) return feel?.[key] || theme?.[key] || (lane === 'counter' ? theme?.leadInstrument : undefined);

  // Keep the authored player while applying the same timbral polish as the
  // default instrument. Otherwise a return to guitar2/brass sounds like an
  // unmastered preset in the middle of an otherwise finished arrangement.
  if (authored === 'brass' && ['Smooth Jazz', 'Jazz / Mediterráneo'].includes(theme?.genre)) return 'mutedHorn';
  if (authored === 'epiano' && feel?.[key] === 'rhodesWarm') return 'rhodesWarm';
  if (authored === 'guitar2') {
    if (theme?.genre === 'Smooth Jazz' || [feel?.leadInstrument, feel?.counterInstrument].includes('jazzGuitar')) return 'jazzGuitar';
    if (theme?.genre === 'Bossa / Latin Lounge' || [feel?.leadInstrument, feel?.counterInstrument].includes('nylonGuitar')) return 'nylonGuitar';
  }
  return authored;
}
