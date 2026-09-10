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
