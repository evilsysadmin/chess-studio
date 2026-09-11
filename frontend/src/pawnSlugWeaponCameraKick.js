const KICK_BY_WEAPON = Object.freeze({
  pistol: 0.008,
  machinegun: 0.018,
  shotgun: 0.06,
  panzerfaust: 0.11,
});

export function pawnSlugWeaponCameraKick(weapon = 'pistol') {
  return KICK_BY_WEAPON[weapon] ?? KICK_BY_WEAPON.pistol;
}

export const PAWN_SLUG_WEAPON_CAMERA_KICK = KICK_BY_WEAPON;
