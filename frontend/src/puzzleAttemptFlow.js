export function canInteractWithPuzzle({ status = 'playing', busy = false, rushEnded = false } = {}) {
  return status === 'playing' && !busy && !rushEnded;
}

export function wrongPuzzleAttemptState({ wrongThisPuzzle = false, streak = 0, rushMode = false } = {}) {
  return {
    wrongThisPuzzle: true,
    offerProtection: !rushMode && !wrongThisPuzzle && Number(streak || 0) > 0,
  };
}

export function canProtectPuzzleStreak({ retryOffer = false, points = 0, cost = 0 } = {}) {
  return Boolean(retryOffer) && Number(points || 0) >= Number(cost || 0);
}
