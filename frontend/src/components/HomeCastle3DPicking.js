export const HOME_CASTLE_PICKABLE_DESTINATIONS = Object.freeze([
  'tournament',
  'combat',
  'play',
]);

const PICKABLE_DESTINATION_SET = new Set(HOME_CASTLE_PICKABLE_DESTINATIONS);

export function homeCastlePickableGroups(propsByRoom = {}) {
  return HOME_CASTLE_PICKABLE_DESTINATIONS
    .map((destination) => propsByRoom?.[destination])
    .filter(Boolean);
}

function destinationFromObject(object) {
  let current = object;
  while (current) {
    const destination = current?.userData?.destination;
    if (PICKABLE_DESTINATION_SET.has(destination)) return destination;
    current = current.parent;
  }
  return null;
}

export function homeCastleDestinationFromIntersections(intersections = []) {
  for (const intersection of intersections || []) {
    const destination = destinationFromObject(intersection?.object);
    if (destination) return destination;
  }
  return null;
}
