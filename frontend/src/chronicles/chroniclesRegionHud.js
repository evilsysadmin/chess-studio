// Scene metadata is authoritative. Only legacy dungeon routes retain the
// historic crypt counter while the campaign's explicit floor naming evolves.
export function chroniclesRegionHudLocation(map) {
  const kind = map?.regionKind || 'dungeon';
  if (kind === 'settlement') {
    return { kind: 'PUEBLO', value: String(map?.title || 'Swordhaven').split(' · ')[0].toUpperCase() };
  }
  if (kind === 'wilderness') {
    return { kind: 'EXTERIOR', value: String(map?.title || 'Camino').split(' · ')[0].toUpperCase() };
  }
  return { kind: 'CRIPTA', value: '01' };
}
