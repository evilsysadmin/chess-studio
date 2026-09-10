export const PAWN_SLUG_PISTOL_FEEL = Object.freeze({
  cadenceMs: 380,
  recoilSeconds: 0.18,
  raisePortion: 0.28,
  blastPortion: 0.16,
  recoverPortion: 0.56,
});

export function pawnSlugPistolFirePhase(recoilRemaining = 0) {
  const total = PAWN_SLUG_PISTOL_FEEL.recoilSeconds;
  const remaining = Math.max(0, Math.min(total, Number(recoilRemaining) || 0));
  if (remaining <= 0) return Object.freeze({ active: false, phase: 'idle', progress: 1 });
  const elapsed = total - remaining;
  const progress = elapsed / total;
  if (progress < PAWN_SLUG_PISTOL_FEEL.raisePortion) {
    return Object.freeze({ active: true, phase: 'raise', progress: progress / PAWN_SLUG_PISTOL_FEEL.raisePortion });
  }
  if (progress < PAWN_SLUG_PISTOL_FEEL.raisePortion + PAWN_SLUG_PISTOL_FEEL.blastPortion) {
    return Object.freeze({ active: true, phase: 'blast', progress: (progress - PAWN_SLUG_PISTOL_FEEL.raisePortion) / PAWN_SLUG_PISTOL_FEEL.blastPortion });
  }
  const recoverStart = PAWN_SLUG_PISTOL_FEEL.raisePortion + PAWN_SLUG_PISTOL_FEEL.blastPortion;
  return Object.freeze({ active: true, phase: 'recover', progress: (progress - recoverStart) / PAWN_SLUG_PISTOL_FEEL.recoverPortion });
}
