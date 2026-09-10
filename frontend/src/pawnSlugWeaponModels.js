const variant = (value) => Object.freeze({
  damage: 1,
  cadence: 1,
  spread: 1,
  recoil: 1,
  capacity: 1,
  reload: 1,
  mobility: 1,
  ...value,
});

export const PAWN_SLUG_WEAPON_MODELS = Object.freeze({
  pistol: Object.freeze([
    variant({ id: 'glock17', label: 'Glock 17', damage: 0.98, cadence: 0.97, recoil: 0.94, capacity: 1.08 }),
    variant({ id: 'dienstpistole', label: 'Dienstpistole', damage: 1, cadence: 1, recoil: 1, capacity: 1 }),
    variant({ id: 'desert-eagle', label: 'Desert Eagle', damage: 1.12, cadence: 1.12, recoil: 1.18, capacity: 0.82, mobility: 0.97 }),
  ]),
  smg: Object.freeze([
    variant({ id: 'mac10', label: 'Ingram MAC-10', damage: 0.96, cadence: 0.9, spread: 1.13, recoil: 1.1, capacity: 1.04 }),
    variant({ id: 'uzi', label: 'Uzi', damage: 1, cadence: 0.96, spread: 1.04, recoil: 1.03, capacity: 1.05 }),
    variant({ id: 'mp5', label: 'MP5', damage: 0.98, cadence: 1.01, spread: 0.9, recoil: 0.9, capacity: 0.96 }),
  ]),
  rifle: Object.freeze([
    variant({ id: 'akm', label: 'AKM', damage: 1.08, cadence: 1.03, spread: 1.08, recoil: 1.12, capacity: 1 }),
    variant({ id: 'm16a1', label: 'M16A1', damage: 0.98, cadence: 0.96, spread: 0.94, recoil: 0.95, capacity: 1 }),
    variant({ id: 'g3', label: 'G3', damage: 1.12, cadence: 1.08, spread: 1.02, recoil: 1.16, capacity: 0.9, mobility: 0.96 }),
  ]),
  shotgun: Object.freeze([
    variant({ id: 'm3-super90', label: 'Benelli M3', damage: 1.03, cadence: 0.96, spread: 0.96, recoil: 1.02, capacity: 1 }),
    variant({ id: 'm870', label: 'Remington 870', damage: 1.08, cadence: 1.08, spread: 1.04, recoil: 1.08, capacity: 0.9 }),
    variant({ id: 'spas12', label: 'SPAS-12', damage: 1.02, cadence: 0.93, spread: 1.03, recoil: 1.06, capacity: 1.04, mobility: 0.96 }),
  ]),
  machinegun: Object.freeze([
    variant({ id: 'm249', label: 'M249', damage: 0.98, cadence: 0.95, spread: 0.96, recoil: 0.95, capacity: 1.16, mobility: 0.94 }),
    variant({ id: 'mg42', label: 'MG-42', damage: 1, cadence: 0.88, spread: 1.12, recoil: 1.12, capacity: 1.05, mobility: 0.92 }),
    variant({ id: 'rpk', label: 'RPK', damage: 1.06, cadence: 1.03, spread: 1.02, recoil: 1.04, capacity: 0.96, mobility: 0.98 }),
  ]),
  launcher: Object.freeze([
    variant({ id: 'm79', label: 'M79', damage: 1.08, cadence: 1.14, recoil: 1.04, capacity: 0.82, mobility: 1.03 }),
    variant({ id: 'rpg7', label: 'RPG-7', damage: 1.12, cadence: 1.1, recoil: 1.12, capacity: 0.9, mobility: 0.94 }),
    variant({ id: 'panzerfaust', label: 'Panzerfaust', damage: 1, cadence: 1, recoil: 1, capacity: 1, mobility: 1 }),
  ]),
});

export function pawnSlugWeaponModel(family, id) {
  const models = PAWN_SLUG_WEAPON_MODELS[family] || [];
  return models.find((model) => model.id === id) || models[0] || null;
}

export function pawnSlugApplyWeaponModel(stats, family, id) {
  const model = pawnSlugWeaponModel(family, id);
  if (!model) return Object.freeze({ ...stats });
  return Object.freeze({
    ...stats,
    modelId: model.id,
    modelLabel: model.label,
    damage: stats.damage * model.damage,
    cadence: Math.max(45, Math.round(stats.cadence * model.cadence)),
    spread: stats.spread * model.spread,
    recoil: (stats.recoil ?? 1) * model.recoil,
    capacity: Math.max(1, Math.round((stats.capacity ?? stats.ammo ?? 1) * model.capacity)),
    reload: (stats.reload ?? 1) * model.reload,
    mobility: (stats.mobility ?? 1) * model.mobility,
  });
}
