export const SPACED_REVIEW_INTERVAL_DAYS = Object.freeze([3, 7, 21]);

const DAY_MS = 86_400_000;

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanAnchor(puzzle) {
  const explicit = timestamp(puzzle?.lastCleanAt);
  if (explicit !== null) return explicit;
  if (Number(puzzle?.cleanSolves || 0) <= 0) return null;
  return timestamp(puzzle?.masteredAt)
    ?? timestamp(puzzle?.lastSolvedAt)
    ?? timestamp(puzzle?.createdAt);
}

function addDaysIso(nowMs, days) {
  return new Date(nowMs + (days * DAY_MS)).toISOString();
}

export function isPersonalPuzzleCurrentlyClean(puzzle) {
  if (Number(puzzle?.cleanSolves || 0) <= 0) return false;
  const brokenAt = timestamp(puzzle?.retentionBrokenAt);
  if (brokenAt === null) return true;
  const cleanAt = cleanAnchor(puzzle);
  return cleanAt !== null && cleanAt > brokenAt;
}

export function spacedReviewState(puzzle, now = Date.now()) {
  if (puzzle?.source !== 'autopsy' || !isPersonalPuzzleCurrentlyClean(puzzle)) {
    return {
      eligible: false,
      due: false,
      completed: false,
      stage: 0,
      intervalDays: null,
      dueAt: null,
    };
  }

  const rawStage = Math.max(0, Math.floor(Number(puzzle?.retentionStage || 0)));
  const completed = Boolean(puzzle?.retentionCompletedAt) || rawStage >= SPACED_REVIEW_INTERVAL_DAYS.length;
  if (completed) {
    return {
      eligible: true,
      due: false,
      completed: true,
      stage: SPACED_REVIEW_INTERVAL_DAYS.length,
      intervalDays: null,
      dueAt: null,
    };
  }

  const stage = Math.min(rawStage, SPACED_REVIEW_INTERVAL_DAYS.length - 1);
  const intervalDays = SPACED_REVIEW_INTERVAL_DAYS[stage];
  const storedDueAt = timestamp(puzzle?.nextReviewAt);
  const anchor = cleanAnchor(puzzle);
  const dueMs = storedDueAt ?? (anchor !== null ? anchor + (intervalDays * DAY_MS) : null);
  const dueAt = dueMs === null ? null : new Date(dueMs).toISOString();

  return {
    eligible: dueMs !== null,
    due: dueMs !== null && dueMs <= Number(now),
    completed: false,
    stage,
    intervalDays,
    dueAt,
  };
}

export function personalSpacedReviewSummary(puzzles = [], { now = Date.now() } = {}) {
  const entries = (Array.isArray(puzzles) ? puzzles : [])
    .map((puzzle) => ({ puzzle, state: spacedReviewState(puzzle, now) }))
    .filter((entry) => entry.state.eligible);

  const due = entries
    .filter((entry) => entry.state.due)
    .sort((a, b) => Date.parse(a.state.dueAt) - Date.parse(b.state.dueAt)
      || Number(b.puzzle?.loss || 0) - Number(a.puzzle?.loss || 0)
      || String(a.puzzle?.id || '').localeCompare(String(b.puzzle?.id || '')));
  const upcoming = entries
    .filter((entry) => !entry.state.due && !entry.state.completed)
    .sort((a, b) => Date.parse(a.state.dueAt) - Date.parse(b.state.dueAt));
  const completed = entries.filter((entry) => entry.state.completed);

  return {
    due,
    upcoming,
    completed,
    dueCount: due.length,
    upcomingCount: upcoming.length,
    completedCount: completed.length,
    nextAt: due[0]?.state?.dueAt || upcoming[0]?.state?.dueAt || null,
  };
}

export function spacedReviewResultPatch(puzzle, {
  solved = false,
  clean = false,
  now = Date.now(),
} = {}) {
  if (puzzle?.source !== 'autopsy') return {};

  const nowMs = Number(now);
  const nowIso = new Date(nowMs).toISOString();
  const state = spacedReviewState(puzzle, nowMs);
  const currentlyClean = isPersonalPuzzleCurrentlyClean(puzzle);

  if (solved && clean) {
    const cleanPatch = {
      lastCleanAt: nowIso,
      retentionBrokenAt: null,
    };

    // Si el caso ya venció, cualquier revisión real de esa misma posición
    // cuenta como repaso. No hace falta abrir un cuarto modo de puzzle sólo
    // para transportar un booleano hasta aquí.
    if (state.eligible && state.due && !state.completed) {
      const nextStage = state.stage + 1;
      if (nextStage >= SPACED_REVIEW_INTERVAL_DAYS.length) {
        return {
          ...cleanPatch,
          retentionStage: SPACED_REVIEW_INTERVAL_DAYS.length,
          nextReviewAt: null,
          retentionCompletedAt: nowIso,
        };
      }
      return {
        ...cleanPatch,
        retentionStage: nextStage,
        nextReviewAt: addDaysIso(nowMs, SPACED_REVIEW_INTERVAL_DAYS[nextStage]),
        retentionCompletedAt: null,
      };
    }

    // Resolver de nuevo antes de que venza un repaso no permite acelerar el
    // calendario a base de repetir la misma posición. Si el caso ya estaba
    // limpio, conservamos su cita o su retención completada.
    if (currentlyClean && state.eligible) return cleanPatch;

    return {
      ...cleanPatch,
      retentionStage: 0,
      nextReviewAt: addDaysIso(nowMs, SPACED_REVIEW_INTERVAL_DAYS[0]),
      retentionCompletedAt: null,
    };
  }

  // Una recaída en un caso que ya había sido limpio invalida esa evidencia.
  // El siguiente acierto limpio arrancará otra vez el ciclo 3/7/21.
  if (Number(puzzle?.cleanSolves || 0) > 0 || currentlyClean || state.completed) {
    return {
      retentionBrokenAt: nowIso,
      retentionStage: 0,
      nextReviewAt: null,
      retentionCompletedAt: null,
    };
  }

  return {};
}
