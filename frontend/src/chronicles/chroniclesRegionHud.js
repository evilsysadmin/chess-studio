// Scene metadata is authoritative. Only legacy dungeon routes retain the
// historic crypt counter while the campaign's explicit floor naming evolves.
export function chroniclesRegionHudLocation(map) {
  const kind = map?.regionKind || 'dungeon';
  if (kind === 'settlement') {
    return { kind: 'PUEBLO', value: String(map?.title || 'Swordhaven').split(' · ')[0].toUpperCase() };
  }
  if (kind === 'wilderness') {
    // Terra areas carry their MM3-style grid code (A1–F6).
    return {
      kind: map?.areaCode ? `ÁREA ${map.areaCode}` : 'EXTERIOR',
      value: String(map?.title || 'Camino').split(' · ')[0].toUpperCase(),
    };
  }
  // Authored campaign dungeons carry their own name (e.g. a town's sewers).
  if (kind === 'dungeon' && map?.layoutMode === 'authored' && map?.title) {
    return { kind: 'MAZMORRA', value: String(map.hudTitle || map.title).toUpperCase() };
  }
  return { kind: 'CRIPTA', value: '01' };
}
