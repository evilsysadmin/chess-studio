function hook(instrumentRole, sections, repeatPeriod, durationSteps, volume, motif) {
  return Object.freeze({
    instrumentRole,
    sections: Object.freeze(sections),
    everyCycles: 2,
    repeatPeriod,
    durationSteps,
    volume,
    motif: Object.freeze(motif),
  });
}

// Short, authored phrases for published scores that already had a distinct
// arrangement but no recurring musical calling card. The phrases stay sparse:
// they identify a track without turning a long chess session into jingle radio.
export const AMBIENT_GENRE_HOOKS = Object.freeze({
  casablanca: hook('existing', [0], 32, 6.0, 0.22, { 6:70, 14:74, 22:67, 30:72 }),
  velvet: hook('lead', [0], 32, 5.5, 0.20, { 2:74, 10:79, 18:76, 26:72 }),
  bosphorusRain: hook('counter', [0,2], 64, 5.4, 0.18, { 6:67, 22:71, 38:69, 54:64 }),
  beirutRooftop0412: hook('counter', [1,3], 72, 3.6, 0.19, { 8:69, 24:74, 42:71, 60:76 }),
  casablancaLastCall: hook('counter', [0,3], 64, 4.8, 0.18, { 10:72, 26:68, 42:75, 58:70 }),
  aleppoAfterRain: hook('counter', [0,2], 64, 3.8, 0.17, { 4:71, 20:74, 36:69, 52:73 }),
  ammanVelvetRoom: hook('counter', [1,3], 64, 4.4, 0.18, { 6:76, 18:73, 38:79, 54:75 }),
  medinaBlueSmoke: hook('lead', [0,3], 72, 4.2, 0.18, { 9:64, 27:69, 45:67, 63:71 }),
  // Red Table used to inherit the legacy muted-horn sting every 24 steps.
  // That bright, repetitive attack was the audible “chiu-chiu”. Keep the table
  // dry and let the oud answer only every other cycle with a low, spacious cell.
  tangierRedTable: hook('lead', [0,2], 64, 5.0, 0.14, { 6:64, 22:67, 40:62, 56:69 }),
  beirutNightTaxi: hook('lead', [1,3], 72, 3.2, 0.20, { 5:62, 19:69, 41:66, 59:71 }),
  andalusianCoast: hook('lead', [0,2], 64, 3.8, 0.18, { 7:67, 23:73, 39:70, 55:75 }),
  cadizLanterns: hook('counter', [1,3], 72, 4.0, 0.18, { 8:69, 26:66, 44:73, 62:67 }),
  bishopBlues: hook('lead', [0,1], 48, 5.2, 0.20, { 4:64, 16:67, 28:63, 40:70 }),
  terraceFireflies: hook('counter', [0,2], 64, 4.8, 0.18, { 6:79, 22:77, 38:82, 54:76 }),
  // These three already have a muted horn as a useful foreground colour, but
  // repeating that same attack as the calling card turns the colour into a UI
  // chirp. Let the existing organic/soft counter player carry the sparse hook
  // instead and make the phrase breathe over a longer cycle.
  cafeFirelight: hook('counter', [0,2], 96, 6.0, 0.15, { 4:68, 20:65, 36:72, 52:67 }),
  malagaLastTram: hook('lead', [1,3], 64, 4.4, 0.18, { 5:67, 21:64, 37:69, 53:62 }),
  beirutHarbor2340: hook('counter', [0,2], 64, 4.2, 0.18, { 6:67, 18:70, 34:74, 50:69 }),
  cordobaRooftop0026: hook('lead', [0,2], 64, 3.8, 0.18, { 5:69, 21:76, 37:72, 53:74 }),
  damascusCourtyard0144: hook('lead', [0,2], 48, 6.4, 0.16, { 6:65, 18:72, 30:68, 42:63 }),
  ammanLateTable0303: hook('lead', [0,2], 64, 5.0, 0.17, { 8:67, 24:70, 40:65, 56:72 }),
  // Oud Trench keeps the dry oscillator oud only as a recognisable, occasional
  // colour. The continuous lane is modelled nylon; stretching this hook prevents
  // the remaining oud accent from becoming another bright repeating notification.
  oudTrench: hook('lead', [0,1], 96, 5.4, 0.14, { 6:57, 22:64, 38:62, 54:67 }),
  velvetStatic: hook('counter', [0,1], 64, 6.2, 0.16, { 12:55, 28:59, 44:52, 60:57 }),
  knightAlleyNoir: hook('counter', [0,1], 64, 5.6, 0.17, { 8:65, 24:62, 40:68, 56:61 }),
  concreteRain: hook('counter', [0,1], 96, 7.2, 0.15, { 6:65, 22:62, 38:67, 54:60 }),
  queenBossa: hook('lead', [0,1], 64, 3.8, 0.18, { 6:67, 18:71, 38:64, 54:69 }),
  // Havana used to stamp a short bandoneon oscillator phrase over its own
  // arrangement. On repetition the bright reed attack became the most audible
  // thing in the track. Let the modelled guitar answer instead and give the
  // phrase more air so it reads as an arrangement detail, not a notification.
  havana205: hook('counter', [0,1], 96, 5.2, 0.15, { 8:69, 20:65, 40:72, 56:66 }),
  blueLobby: hook('counter', [0,2], 96, 6.2, 0.15, { 10:72, 24:68, 42:75, 58:67 }),
});

export const AMBIENT_GENRE_HOOK_IDS = Object.freeze(Object.keys(AMBIENT_GENRE_HOOKS));

export function withAmbientGenreHook(theme, feel) {
  const spec = AMBIENT_GENRE_HOOKS[theme?.id];
  if (!spec || !feel) return feel;
  const selectedInstrument = spec.instrumentRole === 'existing'
    ? feel.signature?.instrument
    : spec.instrumentRole === 'counter'
      ? (feel.counterInstrument || theme.counterInstrument)
      : (feel.leadInstrument || theme.leadInstrument);
  // Havana's counter lane is promoted from the legacy guitar2 alias to the
  // modelled nylon voice later in the production chain. Its signature must use
  // that same final timbre instead of freezing the pre-polish alias here.
  const instrument = theme?.id === 'havana205' && selectedInstrument === 'guitar2'
    ? 'nylonGuitar'
    : selectedInstrument;
  if (!instrument) return feel;
  return Object.freeze({
    ...feel,
    layers: Object.freeze({ ...(feel.layers || {}), signature: true }),
    signature: Object.freeze({
      instrument,
      sections: spec.sections,
      everyCycles: spec.everyCycles,
      repeatPeriod: spec.repeatPeriod,
      durationSteps: spec.durationSteps,
      volume: spec.volume,
      motif: spec.motif,
    }),
  });
}
