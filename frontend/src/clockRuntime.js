function normalizeSeconds(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function normalizeSnapshot(value = {}) {
  return {
    whiteTime: normalizeSeconds(value.whiteTime),
    blackTime: normalizeSeconds(value.blackTime),
    tickingColor: value.tickingColor === 'w' || value.tickingColor === 'b' ? value.tickingColor : null,
    flagFallen: value.flagFallen === 'w' || value.flagFallen === 'b' ? value.flagFallen : null,
  };
}

function snapshotsEqual(left, right) {
  return left.whiteTime === right.whiteTime
    && left.blackTime === right.blackTime
    && left.tickingColor === right.tickingColor
    && left.flagFallen === right.flagFallen;
}

/**
 * External store for the live chess clock.
 *
 * The display can still advance five times per second, but only the two clock
 * labels subscribe to these snapshots. GameScreen and the complete board tree
 * therefore stop reconciling merely because 200 ms elapsed.
 */
export function createClockRuntime(initialSnapshot = {}) {
  let snapshot = normalizeSnapshot(initialSnapshot);
  const listeners = new Set();

  const publish = (nextValue) => {
    const next = normalizeSnapshot(nextValue);
    if (snapshotsEqual(snapshot, next)) return snapshot;
    snapshot = next;
    listeners.forEach((listener) => listener());
    return snapshot;
  };

  const patch = (changes) => publish({ ...snapshot, ...changes });

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replace: publish,
    setTickingColor(color) {
      return patch({ tickingColor: color });
    },
    setFlagFallen(color) {
      return patch({ flagFallen: color, tickingColor: null });
    },
    getTime(color) {
      return color === 'w' ? snapshot.whiteTime : snapshot.blackTime;
    },
    advance(color, elapsedSeconds) {
      const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
      if (color === 'w') return patch({ whiteTime: Math.max(0, (snapshot.whiteTime ?? 0) - elapsed), tickingColor: 'w' });
      if (color === 'b') return patch({ blackTime: Math.max(0, (snapshot.blackTime ?? 0) - elapsed), tickingColor: 'b' });
      return snapshot;
    },
    addIncrement(color, incrementSeconds) {
      const increment = Math.max(0, Number(incrementSeconds) || 0);
      if (!increment) return snapshot;
      if (color === 'w') return patch({ whiteTime: (snapshot.whiteTime ?? 0) + increment });
      if (color === 'b') return patch({ blackTime: (snapshot.blackTime ?? 0) + increment });
      return snapshot;
    },
  };
}
