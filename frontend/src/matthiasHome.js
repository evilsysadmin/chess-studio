import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { markMatthiasHomeSessionSeen, matthiasHomeSessionSeen } from './matthiasSession.js';

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


export function buildMatthiasLoginGreeting({ hour = new Date().getHours() } = {}) {
  const safeHour = Number.isFinite(Number(hour)) ? Number(hour) : 12;
  const greeting = safeHour < 12 ? 'Guten Morgen' : safeHour < 19 ? 'Guten Tag' : 'Guten Abend';
  return {
    kind: 'login-greeting',
    text: `${greeting}. De vuelta al tablero. Yo sigo aquí, tomando notas.`,
    action: 'insights',
    actionLabel: 'Ver Así juegas',
  };
}

export function buildMatthiasHomeVisit({ rivalry = {}, memory = null, hasSavedGame = false } = {}) {
  if (hasSavedGame) {
    return {
      kind: 'continue',
      text: 'Has dejado una partida a medias. Yo no digo nada… pero el tablero sí está mirando.',
      action: 'continue',
      actionLabel: 'Continuar partida',
    };
  }
  const goal = memory?.currentObsession || (Array.isArray(memory?.activeGoals) ? memory.activeGoals[0] : null);
  const challenge = memory?.activeChallenge || null;
  const debt = memory?.openDebt || null;
  const reunion = memory?.returnContext || null;
  const milestones = Array.isArray(memory?.recentMilestones) ? memory.recentMilestones : [];
  const milestone = milestones.at(-1) || null;
  const nemesis = memory?.nemesisOpening;
  const respectTier = memory?.respect?.tier || 'recruit';

  if (Number(reunion?.days || 0) >= 14) {
    return {
      kind: 'reunion',
      text: nemesis?.name
        ? `Has vuelto después de ${Number(reunion.days)} días. ${nemesis.name} seguía aquí esperándote. Qué detalle por su parte.`
        : `Has vuelto después de ${Number(reunion.days)} días. El expediente sigue aquí; sorprendentemente, no se ha quemado solo.`,
      action: 'insights',
      actionLabel: 'Reabrir expediente',
    };
  }
  if (challenge?.label) {
    const remaining = Math.max(0, Number(challenge.baseline_games || 0) + Number(challenge.target_games || 3) - Number(challenge.current_games || 0));
    return {
      kind: 'challenge',
      text: `${challenge.label}. ${remaining > 0 ? `Quedan ${remaining} partida${remaining === 1 ? '' : 's'} limpia${remaining === 1 ? '' : 's'}.` : 'La revisión está pendiente.'} ${Number(challenge.setbacks || 0) > 0 ? 'Sí, he visto las reincidencias.' : 'No pienso olvidarlo por educación.'}`,
      action: 'insights',
      actionLabel: 'Ver el reto',
    };
  }
  if (debt && ['struggling', 'mixed'].includes(debt.status)) {
    return {
      kind: 'debt',
      text: 'Mi consejo anterior sigue oficialmente abierto. Los datos nuevos todavía no me permiten retirar la acusación.',
      action: 'insights',
      actionLabel: 'Ver asunto pendiente',
    };
  }
  if (milestone?.kind === 'goal_completed' || milestone?.kind === 'challenge_completed') {
    return {
      kind: 'earned-respect',
      text: `${milestone.label}. Eso ha sido bueno. Muy bueno. No te acostumbres a oírlo.`,
      action: 'insights',
      actionLabel: 'Abrir expediente',
    };
  }
  const memoryVisit = goal ? {
    kind: 'goal',
    text: `Mi obsesión actual: ${goal.label}. Sí, sigo acordándome. Qué desgracia para ti.`,
    action: 'insights',
    actionLabel: 'Ver objetivo',
  } : milestone?.label ? {
    kind: milestone.polarity === 'shame' ? 'memory-shame' : 'memory-fame',
    text: milestone.polarity === 'shame'
      ? `El archivo criminal conserva: ${milestone.label}.`
      : `${milestone.label}. ${['respected', 'formidable'].includes(respectTier) ? 'Te concedo el punto.' : 'Tengo apuntado que, ocasionalmente, haces cosas bien.'}`,
    action: 'insights',
    actionLabel: 'Abrir expediente',
  } : nemesis?.name && Number(nemesis.games || 0) >= 3 ? {
    kind: 'opening-memory',
    text: `${nemesis.name}: ${Math.round(Number(nemesis.win_pct || 0))}% de victorias en ${Number(nemesis.games || 0)} partidas. Esa apertura y tú aún tenéis asuntos pendientes.`,
    action: 'insights',
    actionLabel: 'Ver aperturas',
  } : null;
  return memoryVisit
    || incidentVisit(rivalry)
    || rivalryVisit(rivalry)
    || {
      kind: 'generic',
      text: ['respected', 'formidable'].includes(respectTier)
        ? 'Tengo una partida libre. A estas alturas ya sabes que no pienso regalarte ni el saludo.'
        : 'Tengo una partida libre y una confianza francamente injustificada. ¿La ponemos a prueba?',
      action: 'play',
      actionLabel: 'Jugar una rápida',
    };
}


const MATTHIAS_HOME_IMPORTANT_KINDS = new Set(['intro', 'reunion', 'challenge', 'earned-respect']);

function matthiasHomeMeta(memory = null) {
  const challenge = memory?.activeChallenge || null;
  if (challenge?.label) {
    const target = Math.max(1, Number(challenge.target_games || 3));
    const baseline = Number(challenge.baseline_games || 0);
    const current = Number(challenge.current_games || baseline);
    const progress = Math.max(0, Math.min(target, current - baseline));
    return `Reto activo · ${progress}/${target}`;
  }
  const goal = memory?.currentObsession || (Array.isArray(memory?.activeGoals) ? memory.activeGoals[0] : null);
  if (goal?.label) return `Obsesión actual · ${goal.label}`;
  const nemesis = memory?.nemesisOpening;
  if (nemesis?.name && Number(nemesis.games || 0) >= 3) return `Némesis · ${nemesis.name}`;
  return memory?.relationship?.label || memory?.respect?.label || null;
}

export function buildMatthiasHomeCardModel({ visit = null, memory = null } = {}) {
  const meta = matthiasHomeMeta(memory);
  if (!visit) {
    return {
      variant: 'quiet',
      eyebrow: 'MATTHIAS · EN OBSERVACIÓN',
      text: '…',
      meta,
      action: 'insights',
      actionLabel: 'Ver Así juegas',
    };
  }

  const labels = {
    intro: 'MATTHIAS · PRESENTACIÓN',
    'login-greeting': 'MATTHIAS · WILLKOMMEN',
    reunion: 'MATTHIAS · REENCUENTRO',
    challenge: 'MATTHIAS · RETO ACTIVO',
    debt: 'MATTHIAS · ASUNTO PENDIENTE',
    'earned-respect': 'MATTHIAS · EXPEDIENTE',
    goal: 'MATTHIAS · OBSESIÓN ACTUAL',
    incident: 'MATTHIAS · DEL EXPEDIENTE',
    rivalry: 'MATTHIAS · RIVAL RESIDENTE',
    'memory-shame': 'MATTHIAS · HALL OF SHAME',
    'memory-fame': 'MATTHIAS · HALL OF FAME',
    'opening-memory': 'MATTHIAS · APERTURA NÉMESIS',
    generic: 'MATTHIAS DICE',
  };
  return {
    variant: MATTHIAS_HOME_IMPORTANT_KINDS.has(visit.kind) ? 'important' : 'comment',
    eyebrow: labels[visit.kind] || 'MATTHIAS DICE',
    text: visit.text || '…',
    meta,
    action: visit.action || 'insights',
    actionLabel: visit.actionLabel || 'Ver Así juegas',
  };
}


export function shouldShowMatthiasHome({ hasOpenOverlay = false, hasPriorityAction = false, sessionSeen = false, lastShownAt = null, now = Date.now(), randomValue = Math.random(), relationshipTier = 'newcomer', visitKind = 'generic' } = {}) {
  // Matthias puede estar presente como avatar, pero se calla cuando Home ya
  // tiene una acción prioritaria (especialmente Continuar partida) o un overlay.
  if (hasOpenOverlay || hasPriorityAction || sessionSeen) return false;
  const last = Number(lastShownAt || 0);
  if (last > 0 && now - last < MATTHIAS_HOME_COOLDOWN_MS) return false;

  // A medida que conoce al jugador deja de interrumpir por banalidades. Los
  // objetivos/hitos reales conservan algo más de margen porque sí aportan
  // continuidad; la charla genérica se vuelve deliberadamente más escasa.
  const meaningful = visitKind !== 'generic';
  const genericThreshold = {
    newcomer: 0.40,
    acquainted: 0.32,
    regular: 0.24,
    veteran: 0.18,
  }[relationshipTier] ?? 0.30;
  const threshold = meaningful ? 0.42 : genericThreshold;
  return Number(randomValue) < threshold;
}

export { matthiasHomeSessionSeen } from './matthiasSession.js';

export function markMatthiasHomeShown(now = Date.now()) {
  markMatthiasHomeSessionSeen();
  setProfileStorageItem(MATTHIAS_HOME_LAST_SHOWN_KEY, String(now));
}

export function matthiasHomeLastShownAt() {
  return Number(getStorageItem(STORAGE_LOCAL, MATTHIAS_HOME_LAST_SHOWN_KEY) || 0) || null;
}
