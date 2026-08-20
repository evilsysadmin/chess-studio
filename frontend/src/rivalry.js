import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';

const KEY = 'chess-study-cpu-rivalry';
const MAX_RECENT_GAMES = 80;
const MAX_MEMORIES = 40;

function emptyRecord() {
  return {
    games: 0, wins: 0, draws: 0, losses: 0,
    currentStreak: 0, bestHumanStreak: 0, bestCpuStreak: 0,
    incidents: {},
    recentGames: [],
    milestones: {},
    byTimeControl: {},
    byOpening: {},
    memories: [],
  };
}

function blank() {
  return { version: 3, totalGames: 0, record: emptyRecord(), incidents: {} };
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function migrateLegacy(parsed) {
  const next = blank();
  const rows = parsed?.byPersona && typeof parsed.byPersona === 'object'
    ? Object.values(parsed.byPersona)
    : [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    next.record.games += asNumber(row.games);
    next.record.wins += asNumber(row.wins);
    next.record.draws += asNumber(row.draws);
    next.record.losses += asNumber(row.losses);
    next.record.bestHumanStreak = Math.max(next.record.bestHumanStreak, asNumber(row.bestHumanStreak));
    next.record.bestCpuStreak = Math.max(next.record.bestCpuStreak, asNumber(row.bestCpuStreak));
  }

  next.record.currentStreak = 0;
  next.totalGames = next.record.games || asNumber(parsed?.totalGames);
  next.incidents = parsed?.incidents && typeof parsed.incidents === 'object' ? { ...parsed.incidents } : {};
  return next;
}

function migrateV2(parsed) {
  const next = blank();
  next.totalGames = asNumber(parsed?.totalGames);
  next.incidents = parsed?.incidents && typeof parsed.incidents === 'object' ? { ...parsed.incidents } : {};
  next.record = {
    ...emptyRecord(),
    ...(parsed?.record || {}),
    incidents: parsed?.record?.incidents && typeof parsed.record.incidents === 'object' ? { ...parsed.record.incidents } : {},
    recentGames: [],
    milestones: {},
  };
  return next;
}

export function loadRivalry() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return blank();

    if (parsed.version === 3 && parsed.record && typeof parsed.record === 'object') {
      return {
        ...blank(),
        ...parsed,
        record: {
          ...emptyRecord(),
          ...parsed.record,
          incidents: parsed.record.incidents && typeof parsed.record.incidents === 'object' ? parsed.record.incidents : {},
          recentGames: Array.isArray(parsed.record.recentGames) ? parsed.record.recentGames : [],
          milestones: parsed.record.milestones && typeof parsed.record.milestones === 'object' ? parsed.record.milestones : {},
          byTimeControl: parsed.record.byTimeControl && typeof parsed.record.byTimeControl === 'object' ? parsed.record.byTimeControl : {},
          byOpening: parsed.record.byOpening && typeof parsed.record.byOpening === 'object' ? parsed.record.byOpening : {},
          memories: Array.isArray(parsed.record.memories) ? parsed.record.memories : [],
        },
        incidents: parsed.incidents && typeof parsed.incidents === 'object' ? parsed.incidents : {},
      };
    }

    const migrated = parsed.version === 2 ? migrateV2(parsed) : migrateLegacy(parsed);
    setProfileStorageItem(KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return blank();
  }
}

function save(state) {
  setProfileStorageItem(KEY, JSON.stringify(state));
  return state;
}

function updateMilestones(record, outcome, meta) {
  const milestones = { ...(record.milestones || {}) };
  const moves = asNumber(meta?.moves);
  const now = meta?.date || new Date().toISOString();

  if (outcome === 'win') {
    if (!milestones.firstWin) milestones.firstWin = { date: now, difficulty: meta?.difficulty ?? null, moves: moves || null };
    if (moves > 0 && (!milestones.fastestWinMoves || moves < milestones.fastestWinMoves)) {
      milestones.fastestWinMoves = moves;
      milestones.fastestWinDate = now;
    }
    if (meta?.difficulty != null && (!milestones.highestDifficultyWin || Number(meta.difficulty) > Number(milestones.highestDifficultyWin))) {
      milestones.highestDifficultyWin = Number(meta.difficulty);
      milestones.highestDifficultyWinDate = now;
    }
  }

  if (moves > 0 && (!milestones.longestGameMoves || moves > milestones.longestGameMoves)) {
    milestones.longestGameMoves = moves;
    milestones.longestGameDate = now;
  }
  milestones.lastGameDate = now;
  record.milestones = milestones;
}

export function recordRivalryResult(outcome, meta = {}) {
  const state = loadRivalry();
  const record = state.record;
  state.totalGames += 1;
  record.games += 1;
  if (outcome === 'win') {
    record.wins += 1;
    record.currentStreak = record.currentStreak >= 0 ? record.currentStreak + 1 : 1;
    record.bestHumanStreak = Math.max(record.bestHumanStreak, record.currentStreak);
  } else if (outcome === 'loss') {
    record.losses += 1;
    record.currentStreak = record.currentStreak <= 0 ? record.currentStreak - 1 : -1;
    record.bestCpuStreak = Math.max(record.bestCpuStreak, Math.abs(record.currentStreak));
  } else {
    record.draws += 1;
    record.currentStreak = 0;
  }

  const recent = Array.isArray(record.recentGames) ? [...record.recentGames] : [];
  recent.unshift({
    date: meta.date || new Date().toISOString(),
    outcome,
    difficulty: meta.difficulty ?? null,
    humanColor: meta.humanColor || null,
    opening: meta.opening || null,
    moves: asNumber(meta.moves),
    timeControlId: meta.timeControlId || null,
    seriesId: meta.seriesId || null,
    rematch: !!meta.rematch,
    runMode: meta.runMode || null,
  });
  record.recentGames = recent.slice(0, MAX_RECENT_GAMES);

  const rhythm = meta.timeControlId || 'none';
  const byTime = { ...(record.byTimeControl || {}) };
  const rhythmRow = { games: 0, wins: 0, draws: 0, losses: 0, ...(byTime[rhythm] || {}) };
  rhythmRow.games += 1;
  if (outcome === 'win') rhythmRow.wins += 1;
  else if (outcome === 'loss') rhythmRow.losses += 1;
  else rhythmRow.draws += 1;
  byTime[rhythm] = rhythmRow;
  record.byTimeControl = byTime;

  const openingName = meta.opening || 'Sin identificar';
  const byOpening = { ...(record.byOpening || {}) };
  const openingRow = { games: 0, wins: 0, draws: 0, losses: 0, ...(byOpening[openingName] || {}) };
  openingRow.games += 1;
  if (outcome === 'win') openingRow.wins += 1;
  else if (outcome === 'loss') openingRow.losses += 1;
  else openingRow.draws += 1;
  byOpening[openingName] = openingRow;
  record.byOpening = byOpening;

  const beforeMilestones = { ...(record.milestones || {}) };
  updateMilestones(record, outcome, meta);
  const memories = Array.isArray(record.memories) ? [...record.memories] : [];
  const now = meta.date || new Date().toISOString();
  if (!beforeMilestones.firstWin && record.milestones?.firstWin) memories.unshift({ type: 'firstWin', date: now, text: `Primera victoria registrada contra nivel ${meta.difficulty ?? '?'}.` });
  if (outcome === 'win' && record.milestones?.highestDifficultyWin === Number(meta.difficulty) && beforeMilestones.highestDifficultyWin !== record.milestones.highestDifficultyWin) memories.unshift({ type: 'hardestWin', date: now, text: `Nueva victoria de máxima dificultad: nivel ${meta.difficulty}.` });
  if (record.currentStreak > 0 && record.currentStreak === record.bestHumanStreak && record.currentStreak >= 3) memories.unshift({ type: 'humanStreak', date: now, text: `Nueva mejor racha humana: ${record.currentStreak} victorias.` });
  if (record.currentStreak < 0 && Math.abs(record.currentStreak) === record.bestCpuStreak && Math.abs(record.currentStreak) >= 3) memories.unshift({ type: 'cpuStreak', date: now, text: `Nueva racha de la CPU: ${Math.abs(record.currentStreak)} victorias.` });
  if (record.games % 25 === 0) memories.unshift({ type: 'anniversary', date: now, text: `${record.games} partidas de rivalidad acumuladas.` });
  record.memories = memories.slice(0, MAX_MEMORIES);
  return save(state);
}

export function recordRivalryIncident(event, actor = 'human') {
  if (!event?.type) return 0;
  const state = loadRivalry();
  const key = `${actor}:${event.type}`;
  state.record.incidents[key] = (state.record.incidents[key] || 0) + 1;
  state.incidents[key] = (state.incidents[key] || 0) + 1;
  const count = state.incidents[key];
  if ([1, 3, 5, 10, 20].includes(count)) {
    const memories = Array.isArray(state.record.memories) ? [...state.record.memories] : [];
    memories.unshift({ type: 'incident', key, count, date: new Date().toISOString(), text: `${key} registrado ${count} ${count === 1 ? 'vez' : 'veces'}.` });
    state.record.memories = memories.slice(0, MAX_MEMORIES);
  }
  save(state);
  return count;
}

export function recurrenceSuffix(event, actor, count) {
  if (!event?.type || count < 2) return '';
  const key = `${actor}:${event.type}`;
  const custom = {
    'human:MISSED_MATE': ` Es la ${count}.ª vez que el expediente registra un mate ignorado. Ya no es despiste; es doctrina.`,
    'human:QUEEN_EN_PRISE_TO_PAWN': ` Reincidencia nº ${count}: tus damas deberían empezar a pedir traslado.`,
    'human:STALEMATE_BLUNDER': ` Ahogado reincidente nº ${count}. Convertir victorias en tablas empieza a parecer un servicio público.`,
    'human:ALLOWED_MATE': ` Mate regalado nº ${count}. La CPU agradece tu programa de ayudas.`,
    'cpu:PAWN_TAKES_QUEEN': ` Es la ${count}.ª dama tuya que cae ante un peón. Esto ya no es táctica: es una cadena de suministro.`,
    'cpu:KNIGHT_FORK': ` Horquilla sufrida nº ${count}. Los caballos ya conocen tu dirección postal.`,
    'cpu:PAWN_FORK': ` Horquilla de peón sufrida nº ${count}. Una pieza que camina despacio te está haciendo bullying estadístico.`,
  };
  if (custom[key]) return custom[key];
  if (actor !== 'human') return '';
  return ` Incidente nº ${count} de este tipo. El patrón empieza a ser estadísticamente incómodo.`;
}

export function clearRivalry() {
  removeProfileStorageItem(KEY);
}
