// test-setup.js — Mock mínimo de localStorage para los módulos que lo usan
// (combatRoster.js, tournament.js, playerRating.js, gameHistory.js), ya
// que los tests corren en Node, no en un navegador de verdad.

const store = new Map();

global.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
  clear: () => { store.clear(); },
};
