// Opt-in topology contract for the new overworld. Legacy dungeon exits are
// intentionally allowed to remain one-way until their route is migrated.
function exitsTo(map, destinationId) {
  return (map?.exits || []).filter((exit) =>
    (exit.action?.effects || []).some((effect) =>
      effect.type === 'transition-map' && effect.mapId === destinationId));
}

export function chroniclesAssertWorldReturnLinks(maps) {
  const byId = new Map(maps.map((map) => [map.id, map]));
  for (const map of maps) {
    for (const exit of map.exits || []) {
      if (exit.requiresReturn !== true) continue;
      const destinations = (exit.action?.effects || []).filter((effect) => effect.type === 'transition-map');
      if (destinations.length !== 1) {
        throw new Error(`Chronicles world exit ${map.id}/${exit.id} requires exactly one destination`);
      }
      const destination = byId.get(destinations[0].mapId);
      if (!destination) {
        throw new Error(`Chronicles world exit ${map.id}/${exit.id} points to missing region ${destinations[0].mapId}`);
      }
      if (!exitsTo(destination, map.id).some((returnExit) => returnExit.requiresReturn === true)) {
        throw new Error(`Chronicles world exit ${map.id}/${exit.id} has no bidirectional return from ${destination.id}`);
      }
    }
  }
  return true;
}

// A true region transition is never an expedition-end event. Legacy dungeon
// gates still use their existing escape contract until explicitly migrated.
export function chroniclesIsOverworldTravelExit(map, entry) {
  // A campaign dungeon (e.g. a town's sewers) climbs back out through a
  // reciprocal exit: that is travel too, not the end of the expedition.
  const travelRegion = ['settlement', 'wilderness'].includes(map?.regionKind)
    || (map?.regionKind === 'dungeon' && entry?.requiresReturn === true);
  return travelRegion
    && (entry?.action?.effects || []).some((effect) => (
      effect.type === 'transition-map' && typeof effect.mapId === 'string' && effect.mapId.length > 0
    ));
}
