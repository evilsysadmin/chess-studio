export function replayMoveAnimation(move, step, previousStep, movieMode = false) {
  if (!movieMode || !move || step <= 0 || step != previousStep + 1) return null;
  if (!move.from || !move.to) return null;
  return {
    from: move.from,
    to: move.to,
    seq: `movie-${step}`,
    capture: Boolean(move.captured),
    kind: 'move',
  };
}

export function replayMatthiasKingColor(humanColor) {
  return humanColor === 'b' ? 'w' : 'b';
}

export function replayCinematicCue(moveReport) {
  if (moveReport?.severity === 'blunder') return 'critical';
  if (moveReport?.severity === 'mistake') return 'dramatic';
  return 'normal';
}
