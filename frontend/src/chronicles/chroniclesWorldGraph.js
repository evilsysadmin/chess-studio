// First campaign slice: stable connected destinations, kept separate from dungeon depth.
// No storage or run mutation here: campaign persistence is wired in a later slice.
export const CHRONICLES_WORLD_VERSION = 1;
export const CHRONICLES_WORLD_START = 'royal-capital';

export const CHRONICLES_WORLD_LOCATIONS = Object.freeze({
  'royal-capital': Object.freeze({
    id: 'royal-capital', name: 'Capital del Reino', kind: 'town',
    description: 'La Dama espera noticias del Rey desaparecido.',
    exits: Object.freeze([{ id: 'east-road', to: 'old-forest-road', arrival: 'west-gate' }]),
  }),
  'old-forest-road': Object.freeze({
    id: 'old-forest-road', name: 'Camino del Bosque Viejo', kind: 'outdoor',
    description: 'Un sendero que une las murallas con unas ruinas olvidadas.',
    exits: Object.freeze([
      { id: 'west-gate', to: 'royal-capital', arrival: 'east-road' },
      { id: 'ruin-entrance', to: 'old-crypt', arrival: 'ruin-exit' },
    ]),
  }),
  'old-crypt': Object.freeze({
    id: 'old-crypt', name: 'Cripta Antigua', kind: 'dungeon',
    description: 'Una primera pista podría ocultarse tras la piedra.',
    dungeonMapId: 'crypt-eight-squares',
    exits: Object.freeze([{ id: 'ruin-exit', to: 'old-forest-road', arrival: 'ruin-entrance' }]),
  }),
});

export function chroniclesWorldDestination(fromId, exitId) {
  const from = CHRONICLES_WORLD_LOCATIONS[fromId];
  const exit = from?.exits.find((item) => item.id === exitId);
  if (!exit) return null;
  const destination = CHRONICLES_WORLD_LOCATIONS[exit.to];
  if (!destination?.exits.some((item) => item.id === exit.arrival && item.to === fromId)) return null;
  return Object.freeze({ locationId: destination.id, arrivalExitId: exit.arrival });
}

export function validateChroniclesWorldGraph() {
  for (const [id, location] of Object.entries(CHRONICLES_WORLD_LOCATIONS)) {
    if (id !== location.id || !location.exits.length) throw new Error(`Invalid world location: ${id}`);
    for (const exit of location.exits) {
      if (!chroniclesWorldDestination(id, exit.id)) throw new Error(`Broken world exit: ${id}/${exit.id}`);
    }
  }
  const reached = new Set([CHRONICLES_WORLD_START]);
  const queue = [CHRONICLES_WORLD_START];
  while (queue.length) {
    const id = queue.shift();
    for (const exit of CHRONICLES_WORLD_LOCATIONS[id].exits) {
      if (!reached.has(exit.to)) { reached.add(exit.to); queue.push(exit.to); }
    }
  }
  if (reached.size !== Object.keys(CHRONICLES_WORLD_LOCATIONS).length) throw new Error('Disconnected world region');
  return true;
}
