import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';

const KEY = 'chess-study-cpu-rivalry';

function emptyRecord() {
  return {
    games: 0, wins: 0, draws: 0, losses: 0,
    currentStreak: 0, bestHumanStreak: 0, bestCpuStreak: 0,
    incidents: {},
  };
}

function blank() {
  return { version: 2, totalGames: 0, record: emptyRecord(), incidents: {} };
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

  // La racha actual no puede reconstruirse con rigor al mezclar antiguos
  // marcadores antiguos separados, así que se reinicia. Los máximos sí se conservan.
  next.record.currentStreak = 0;
  next.record.incidents = {};
  next.totalGames = next.record.games || asNumber(parsed?.totalGames);
  next.incidents = parsed?.incidents && typeof parsed.incidents === 'object' ? { ...parsed.incidents } : {};
  return next;
}

export function loadRivalry() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return blank();

    if (parsed.version === 2 && parsed.record && typeof parsed.record === 'object') {
      return {
        ...blank(),
        ...parsed,
        record: { ...emptyRecord(), ...parsed.record },
        incidents: parsed.incidents && typeof parsed.incidents === 'object' ? parsed.incidents : {},
      };
    }

    const migrated = migrateLegacy(parsed);
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

export function recordRivalryResult(outcome) {
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
  return save(state);
}

export function recordRivalryIncident(event, actor = 'human') {
  if (!event?.type) return 0;
  const state = loadRivalry();
  const key = `${actor}:${event.type}`;
  state.record.incidents[key] = (state.record.incidents[key] || 0) + 1;
  state.incidents[key] = (state.incidents[key] || 0) + 1;
  save(state);
  return state.incidents[key];
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
