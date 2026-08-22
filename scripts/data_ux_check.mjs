#!/usr/bin/env node

// Gate offline para features de lectura/ambiente que no necesitan React,
// chess.js ni dependencias npm: heatmaps, Daily activo y grada contextual.

globalThis.localStorage = {
  _data: new Map(),
  getItem(key) { return this._data.has(key) ? this._data.get(key) : null; },
  setItem(key, value) { this._data.set(key, String(value)); },
  removeItem(key) { this._data.delete(key); },
  clear() { this._data.clear(); },
};
globalThis.sessionStorage = {
  _data: new Map(),
  getItem(key) { return this._data.has(key) ? this._data.get(key) : null; },
  setItem(key, value) { this._data.set(key, String(value)); },
  removeItem(key) { this._data.delete(key); },
  clear() { this._data.clear(); },
};

const { buildCareerHeatmaps, deriveRpgProfile, lastDailyCells } = await import('../frontend/src/careerVisuals.js');
const { currentDailyStreak } = await import('../frontend/src/dailyChallenge.js');
const { noteworthyPresentation } = await import('../frontend/src/spectatorReactions.js');

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(`data-ux-check: ${message}`);
}

const heat = buildCareerHeatmaps([{ humanColor: 'w', moves: [
  { from: 'e2', to: 'e4', san: 'e4' },
  { from: 'd7', to: 'd5', san: 'd5' },
  { from: 'e4', to: 'd5', san: 'exd5', captured: 'p' },
  { from: 'd8', to: 'd5', san: 'Qxd5', captured: 'p' },
] }]);
assert(heat.activity.e4 === 1, 'actividad humana real');
assert(heat.captures.d5 === 1, 'captura humana real');
assert(heat.losses.d5 === 1, 'baja humana real');

const rpg = deriveRpgProfile(
  [{ humanColor: 'w', moves: [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }, { san: 'Nc6' }, { san: 'O-O' }] }],
  { a: { accuracy: 84, peakPerspectiveEval: 350, troughPerspectiveEval: -450, outcome: 'win' }, b: { accuracy: 76, peakPerspectiveEval: 400, troughPerspectiveEval: -350, outcome: 'loss' } },
  { pressure: { moves: 10, incidents: 2 } },
);
const attrs = Object.fromEntries(rpg.attributes.map((row) => [row.id, row.value]));
assert(attrs.precision === 80 && attrs.conversion === 50 && attrs.resilience === 50, 'perfil RPG deriva sólo de muestras');

const cells = lastDailyCells(['2026-08-22'], 28, new Date('2026-08-22T12:00:00'));
assert(cells.length === 28 && cells.at(-1)?.solved && cells.at(-1)?.today, 'calendario Daily 28 días');

localStorage.clear();
localStorage.setItem('chess-study-daily-challenge', JSON.stringify({ solvedDates: ['2026-08-01', '2026-08-02'], bestStreak: 2 }));
const stale = currentDailyStreak(new Date('2026-08-22T12:00:00'));
assert(stale.streak === 0 && stale.bestStreak === 2, 'racha antigua no se presenta como activa');

const quiet = noteworthyPresentation({ type: 'KNIGHT_FORK', priority: 20 }, 'human', 3);
assert(!quiet.cpu && !quiet.audience, 'evento menor permanece silencioso');
const first = noteworthyPresentation({ type: 'KNIGHT_FORK', priority: 75 }, 'human', 12);
const second = noteworthyPresentation({ type: 'KNIGHT_FORK', priority: 75 }, 'human', 12);
assert(JSON.stringify(first) === JSON.stringify(second), 'routing de grada determinista por evento/ply');

let silent = 0;
for (let ply = 0; ply < 200; ply += 1) {
  const presentation = noteworthyPresentation({ type: 'KNIGHT_FORK', priority: 70 }, 'human', ply);
  if (presentation.mode === 'silence') silent += 1;
}
assert(silent >= 50, 'la grada conserva silencio significativo');

console.log(`data-ux-check OK · ${checks} checks offline`);
