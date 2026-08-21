// test-setup.js — Web Storage mínimo para los módulos que corren en Node.
// localStorage persiste entre sesiones; sessionStorage es independiente, como
// en el navegador. Cada test los limpia explícitamente cuando lo necesita.

function makeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

global.localStorage = makeStorage();
global.sessionStorage = makeStorage();
