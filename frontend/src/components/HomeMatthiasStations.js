// Stations are more precise than broad zones: they place the live actor next
// to the physical prop that explains the current routine. Keep this derived
// from the stable scene key so an F5 cannot reroll Matthias across the hall.
const HOME_STATION_PATTERNS = Object.freeze([
  ['chess-chair', 'chair-seat', /chess-inception|solo-board-inception/],
  ['rest', 'lounge-seat', /sleep/],
  ['library-chair', 'chair-seat', /reading|strategy-book|chess-weekly/],
  ['writing-desk', 'chair-seat', /dossier|ops/],
  ['refreshment-table', 'foreground-rug', /coffee|breakfast|beer|night/],
  ['dining-table', 'foreground-rug', /lunch|dinner/],
]);

const WATCH_POST = Object.freeze({ station:'watch-post', support:'foreground-rug' });

export function matthiasHomePlacement(sceneKey = 'base', speaking = false) {
  if (speaking) return WATCH_POST;
  const key = String(sceneKey || 'base').toLowerCase();
  const placement = HOME_STATION_PATTERNS.find(([, , pattern]) => pattern.test(key));
  return placement
    ? { station:placement[0], support:placement[1] }
    : WATCH_POST;
}

export function matthiasHomeStation(sceneKey = 'base') {
  return matthiasHomePlacement(sceneKey).station;
}
