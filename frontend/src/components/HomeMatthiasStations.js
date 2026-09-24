// Stations are more precise than broad zones: they place the live actor next
// to the physical prop that explains the current routine. Keep this derived
// from the stable scene key so an F5 cannot reroll Matthias across the hall.
const HOME_STATION_PATTERNS = Object.freeze([
  ['chess-chair', /chess-inception|solo-board-inception/],
  ['rest', /sleep/],
  ['library-chair', /reading|strategy-book|chess-weekly/],
  ['writing-desk', /dossier|ops/],
  ['refreshment-table', /coffee|breakfast|beer|night/],
  ['dining-table', /lunch|dinner/],
]);

export function matthiasHomeStation(sceneKey = 'base') {
  const key = String(sceneKey || 'base').toLowerCase();
  return HOME_STATION_PATTERNS.find(([, pattern]) => pattern.test(key))?.[0] || 'watch-post';
}
