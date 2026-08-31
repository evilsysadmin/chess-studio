import { buildNemesisDossier } from './nemesis.js';
import { loadPersonalPuzzles } from './personalPuzzles.js';

const CAMPAIGN_MILESTONE_KINDS = new Set(['challenge_completed', 'goal_completed']);

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function matchingPersonalPuzzleCount(puzzles, incidentKey) {
  if (!incidentKey) return 0;
  return (Array.isArray(puzzles) ? puzzles : []).filter((puzzle) => (
    puzzle?.source === 'autopsy'
    && Array.isArray(puzzle?.incidentKeys)
    && puzzle.incidentKeys.includes(incidentKey)
  )).length;
}

function challengeChapter(challenge, puzzles) {
  if (!challenge?.id || !challenge?.label) return null;
  const baselineGames = Math.max(0, Number(challenge.baseline_games || 0));
  const currentGames = Math.max(baselineGames, Number(challenge.current_games || baselineGames));
  const target = Math.max(1, Number(challenge.target_games || 3));
  const progress = clamp(currentGames - baselineGames, 0, target);
  const incidentKey = String(challenge.incident_key || '') || null;
  const material = matchingPersonalPuzzleCount(puzzles, incidentKey);
  return {
    id: `challenge:${challenge.id}`,
    kind: 'challenge',
    title: challenge.label,
    eyebrow: 'Capítulo activo · disciplina',
    detail: Number(challenge.setbacks || 0) > 0
      ? `${progress}/${target} partidas limpias desde la última reincidencia · ${Number(challenge.setbacks)} reinicio${Number(challenge.setbacks) === 1 ? '' : 's'} registrado${Number(challenge.setbacks) === 1 ? '' : 's'}.`
      : `${progress}/${target} partidas sin repetir el incidente desde que Matthias abrió el expediente.`,
    progress,
    target,
    progressLabel: `${progress}/${target} partidas`,
    action: material > 0 ? 'personal-filter' : null,
    actionLabel: material > 0 ? `Entrenar ${material} caso${material === 1 ? '' : 's'} real${material === 1 ? '' : 'es'} →` : null,
    filter: material > 0 ? { incidentKey } : null,
  };
}

function goalProgress(goal) {
  const baseline = finite(goal?.baseline);
  const current = finite(goal?.current);
  const baselineGames = Math.max(0, Number(goal?.baseline_games || 0));
  const currentGames = Math.max(baselineGames, Number(goal?.current_games || baselineGames));
  const samples = Math.max(0, currentGames - baselineGames);

  if (goal?.metric === 'incidents_per_game' && baseline !== null && current !== null) {
    const target = baseline * 0.70;
    const denominator = baseline - target;
    const pct = denominator > 0 ? clamp(Math.round(((baseline - current) / denominator) * 100), 0, 100) : 0;
    return {
      pct,
      progressLabel: `${(baseline * 100).toFixed(1)} → ${(current * 100).toFixed(1)} incidentes / 100 partidas`,
      detail: `${samples}/3 partidas nuevas mínimas · objetivo: reducir al menos un 30% la incidencia registrada.`,
    };
  }

  if (goal?.metric === 'opening_win_pct' && baseline !== null && current !== null) {
    const target = Math.min(100, baseline + 15);
    const denominator = Math.max(1, target - baseline);
    const pct = clamp(Math.round(((current - baseline) / denominator) * 100), 0, 100);
    return {
      pct,
      progressLabel: `${Math.round(baseline)}% → ${Math.round(current)}%`,
      detail: `${samples}/3 muestras nuevas mínimas · objetivo: subir 15 puntos de puntuación en esa apertura.`,
    };
  }

  return {
    pct: 0,
    progressLabel: `${samples} partidas nuevas`,
    detail: 'Matthias mantiene el objetivo abierto hasta reunir evidencia comparable suficiente.',
  };
}

function goalChapter(goal, puzzles) {
  if (!goal?.id || !goal?.label) return null;
  const progress = goalProgress(goal);
  const incidentKey = String(goal.id).startsWith('incident:') ? String(goal.id).slice('incident:'.length) : null;
  const material = matchingPersonalPuzzleCount(puzzles, incidentKey);
  return {
    id: `goal:${goal.id}`,
    kind: 'goal',
    title: goal.label,
    eyebrow: 'Siguiente capítulo · objetivo medido',
    detail: progress.detail,
    progressPct: progress.pct,
    progressLabel: progress.progressLabel,
    action: material > 0 ? 'personal-filter' : null,
    actionLabel: material > 0 ? `Trabajar ${material} posición${material === 1 ? '' : 'es'} →` : null,
    filter: material > 0 ? { incidentKey } : null,
  };
}

function nemesisChapter(memory, history) {
  const name = String(memory?.nemesisOpening?.name || '').trim();
  if (!name) return null;
  const dossier = buildNemesisDossier(history || [], {});
  const opening = dossier?.opening?.opening === name ? dossier.opening : null;
  const training = opening && dossier?.training ? dossier.training : null;
  const games = Math.max(0, Number(memory.nemesisOpening.games || opening?.games || 0));
  const score = finite(memory.nemesisOpening.win_pct) ?? finite(opening?.scorePct);
  return {
    id: `nemesis:${name}`,
    kind: 'nemesis',
    title: `Némesis: ${name}`,
    eyebrow: 'Capítulo de rivalidad',
    detail: `${games} partida${games === 1 ? '' : 's'} registrada${games === 1 ? '' : 's'}${score !== null ? ` · ${Math.round(score)}% de victorias` : ''}. La campaña no la da por resuelta por simpatía: hacen falta resultados nuevos.`,
    progressLabel: score !== null ? `${Math.round(score)}% victorias` : `${games} partidas`,
    action: training?.fen ? 'nemesis-position' : null,
    actionLabel: training?.fen ? 'Volver a una derrota real →' : null,
    training: training?.fen ? {
      fen: training.fen,
      humanColor: training.humanColor,
      difficulty: training.difficulty,
      sourceRecordId: training.sourceRecord?.id || null,
    } : null,
    opening: name,
  };
}

function completedChapters(memory) {
  const rows = Array.isArray(memory?.recentMilestones) ? memory.recentMilestones : [];
  return rows
    .filter((item) => item?.polarity === 'fame' && CAMPAIGN_MILESTONE_KINDS.has(item?.kind) && item?.label)
    .slice(-3)
    .reverse()
    .map((item) => ({
      id: String(item.fingerprint || `${item.kind}:${item.at || item.label}`),
      kind: item.kind,
      title: String(item.label),
      at: item.at || null,
    }));
}

export function buildMatthiasPersonalCampaign(memory, {
  history = [],
  puzzles = loadPersonalPuzzles(),
} = {}) {
  if (!memory || typeof memory !== 'object') return null;

  const challenge = challengeChapter(memory.activeChallenge, puzzles);
  const goals = (Array.isArray(memory.activeGoals) ? memory.activeGoals : [])
    .map((goal) => goalChapter(goal, puzzles))
    .filter(Boolean);
  const nemesis = nemesisChapter(memory, history);
  const completed = completedChapters(memory);

  const upcoming = [challenge, ...goals, nemesis]
    .filter(Boolean)
    .filter((chapter, index, rows) => rows.findIndex((candidate) => candidate.id === chapter.id) === index);

  if (!upcoming.length && !completed.length) return null;

  const current = upcoming[0] || null;
  const queue = upcoming.slice(1, 3);
  return {
    title: 'Campaña personal de Matthias',
    current,
    queue,
    completed,
    relationship: memory.relationship?.label || null,
    respect: memory.respect?.label || null,
    chapterCount: (current ? 1 : 0) + queue.length + completed.length,
  };
}
