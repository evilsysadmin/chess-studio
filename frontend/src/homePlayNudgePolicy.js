export function shouldEnableHomePlayNudge({
  suppressHomeNudge = false,
  hasOpenOverlay = false,
  loggingOut = false,
  hasSavedGame = false,
} = {}) {
  return !suppressHomeNudge && !hasOpenOverlay && !loggingOut && !hasSavedGame;
}
