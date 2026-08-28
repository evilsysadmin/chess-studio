import { STORAGE_LOCAL, STORAGE_SESSION, getStorageItem, setStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

export const MATTHIAS_HOME_SESSION_KEY = 'chess-study-matthias-home-seen-v1';
export const MATTHIAS_HOME_LAST_SHOWN_KEY = 'chess-study-matthias-home-last-shown-v1';
export const MATTHIAS_HOME_COOLDOWN_MS = 8 * 60 * 60 * 1000;
export const MATTHIAS_ONBOARDED_KEY = 'matthias.onboarded';
export const MATTHIAS_ONBOARDED_VERSION = '2';

const INCIDENT_COPY = Object.freeze({
  'human:MISSED_MATE': (count) => count > 1
    ? `Llevas ${count} mates ignorados en el expediente. A estas alturas ya no es despiste; es una especialidad.`
    : 'Aquel mate que dejaste pasar sigue teniendo un sitio especial en mi memoria. Una pequeña obra de arte.',
  'human:QUEEN_EN_PRISE_TO_PAWN': (count) => count > 1
    ? `${count} damas expuestas a un peón. Tus damas deberían empezar a pedir escolta.`
    : 'Todavía me acuerdo de aquella dama que dejaste al alcance de un peón. Yo también habría mirado hacia otro lado.',
  'human:STALEMATE_BLUNDER': (count) => count > 1
    ? `${count} victorias convertidas en ahogado. Transformar ventaja en tablas empieza a parecer un servicio público.`
    : 'Ese ahogado que fabricaste desde una posición ganada… sí, todavía me hace gracia.',
  'human:ALLOWED_MATE': (count) => count > 1
    ? `${count} mates regalados. La generosidad está muy bien, pero quizá no con mi rey enfrente.`
    : 'Aquel mate que me regalaste sigue archivado. Gracias de nuevo por las facilidades.',
  'cpu:PAWN_TAKES_QUEEN': (count) => count > 1
    ? `${count} damas tuyas han acabado en manos de un peón. Los peones del sindicato preguntan por ti.`
    : 'Una dama cayendo ante un peón. Hay recuerdos que uno no necesita esforzarse por conservar.',
  'cpu:KNIGHT_FORK': (count) => count > 1
    ? `${count} horquillas de caballo sufridas. Mis caballos ya conocen tu dirección postal.`
    : 'La última horquilla de caballo fue bastante limpia. Dolorosa, pero limpia.',
  'cpu:PAWN_FORK': (count) => count > 1
    ? `${count} horquillas de peón. Una pieza que sólo avanza una casilla te está haciendo bullying estadístico.`
    : 'Aquella horquilla de peón fue humilde, barata y desagradablemente eficaz.',
});

function incidentVisit(rivalry) {
  const incidents = rivalry?.record?.incidents && typeof rivalry.record.incidents === 'object'
    ? rivalry.record.incidents
    : rivalry?.incidents && typeof rivalry.incidents === 'object' ? rivalry.incidents : {};
  const candidates = Object.entries(INCIDENT_COPY)
    .map(([key, render]) => ({ key, count: Number(incidents[key] || 0), render }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const best = candidates[0];
  if (!best) return null;
  return {
    kind: 'incident',
    text: best.render(best.count),
    action: 'train',
    actionLabel: 'Entrenar ese error',
  };
}

function rivalryVisit(rivalry) {
  const record = rivalry?.record || {};
  const recent = Array.isArray(record.recentGames) ? record.recentGames : [];
  const last = recent[0];
  const streak = Number(record.currentStreak || 0);
  if (last?.outcome === 'loss') {
    const level = last.difficulty != null ? ` contra nivel ${last.difficulty}` : '';
    return { kind: 'rivalry', text: `La última fue mía${level}. Podemos llamarlo estudio teórico… o jugar otra.`, action: 'play', actionLabel: 'Jugar una rápida' };
  }
  if (last?.outcome === 'win') {
    const level = last.difficulty != null ? ` en nivel ${last.difficulty}` : '';
    return { kind: 'rivalry', text: `La última me la llevaste${level}. Bien jugado. No hace falta que te acostumbres.`, action: 'play', actionLabel: 'Otra partida' };
  }
  if (streak <= -2) return { kind: 'rivalry', text: `Llevo ${Math.abs(streak)} seguidas. Empiezo a sospechar que te gusta financiar mi autoestima.`, action: 'play', actionLabel: 'Romper la racha' };
  if (streak >= 2) return { kind: 'rivalry', text: `Llevas ${streak} victorias seguidas contra mí. Esto empieza a resultar administrativamente incómodo.`, action: 'play', actionLabel: 'Seguir tentando' };
  return null;
}

export function matthiasOnboarded() {
  // v1 se marcaba antes de que React llegase a pintar el nudge. Algunos perfiles
  // antiguos quedaron como 'onboarded' sin haber visto realmente a Matthias.
  // v2 conserva la misma clave de perfil, pero exige una presentación confirmada.
  return getStorageItem(STORAGE_LOCAL, MATTHIAS_ONBOARDED_KEY) === MATTHIAS_ONBOARDED_VERSION;
}

export function markMatthiasOnboarded() {
  setProfileStorageItem(MATTHIAS_ONBOARDED_KEY, MATTHIAS_ONBOARDED_VERSION);
}

export function matthiasIntroPlacement({
  onboarded = false,
  guideEnabled = true,
  guideVisible = false,
  blocked = false,
} = {}) {
  if (onboarded || blocked) return 'none';
  return guideEnabled && guideVisible ? 'guide' : 'visit';
}

export function buildMatthiasIntroVisit() {
  return {
    kind: 'intro',
    text: 'Guten Morgen. Soy Matthias, el mayor cabronazo ajedrecista a este lado del Tajo. Te ayudaré a triunfar o fracasar; lo que tú decidas. Tschüss.',
    action: 'play',
    actionLabel: 'Jugar con Matthias',
  };
}

export function buildMatthiasHomeVisit({ rivalry = {}, hasSavedGame = false } = {}) {
  if (hasSavedGame) {
    return {
      kind: 'continue',
      text: 'Has dejado una partida a medias. Yo no digo nada… pero el tablero sí está mirando.',
      action: 'continue',
      actionLabel: 'Continuar partida',
    };
  }
  return incidentVisit(rivalry)
    || rivalryVisit(rivalry)
    || {
      kind: 'generic',
      text: 'Tengo una partida libre y una confianza francamente injustificada. ¿La ponemos a prueba?',
      action: 'play',
      actionLabel: 'Jugar una rápida',
    };
}

export function shouldShowMatthiasHome({ hasOpenOverlay = false, sessionSeen = false, lastShownAt = null, now = Date.now(), randomValue = Math.random() } = {}) {
  if (hasOpenOverlay || sessionSeen) return false;
  const last = Number(lastShownAt || 0);
  if (last > 0 && now - last < MATTHIAS_HOME_COOLDOWN_MS) return false;
  return Number(randomValue) < 0.45;
}

export function matthiasHomeSessionSeen() {
  return getStorageItem(STORAGE_SESSION, MATTHIAS_HOME_SESSION_KEY) === '1';
}

export function markMatthiasHomeShown(now = Date.now()) {
  setStorageItem(STORAGE_SESSION, MATTHIAS_HOME_SESSION_KEY, '1');
  setProfileStorageItem(MATTHIAS_HOME_LAST_SHOWN_KEY, String(now));
}

export function matthiasHomeLastShownAt() {
  return Number(getStorageItem(STORAGE_LOCAL, MATTHIAS_HOME_LAST_SHOWN_KEY) || 0) || null;
}
