const INCIDENT_COPY = Object.freeze({
  'human:MISSED_MATE': (count) => count > 1
    ? `Ya van ${count} mates disponibles que dejaste pasar. Lo llamaremos reincidencia para no llamarlo vocación.`
    : 'Hay un mate disponible ignorado en tu expediente. Sigue siendo difícil no mirarlo.',
  'human:ALLOWED_MATE': (count) => count > 1
    ? `${count} mates permitidos. Mi archivo agradece tu generosidad; tu rey probablemente no.`
    : 'Permitiste un mate y quedó archivado. Breve, contundente y bastante feo.',
  'human:QUEEN_EN_PRISE_TO_PAWN': (count) => count > 1
    ? `${count} damas expuestas a peones. Tus damas deberían solicitar protección sindical.`
    : 'Una dama tuya quedó expuesta a un peón. Es el tipo de detalle que un expediente conserva solo.',
  'human:STALEMATE_BLUNDER': (count) => count > 1
    ? `${count} ventajas terminaron en ahogado. Convertir victoria en tablas empieza a parecer procedimiento.`
    : 'Una ventaja tuya terminó en ahogado. El expediente lo llama conversión creativa.',
  'cpu:PAWN_TAKES_QUEEN': (count) => count > 1
    ? `${count} damas capturadas por peones de Matthias. Los peones han pedido una placa conmemorativa.`
    : 'Uno de mis peones capturó tu dama. No necesito adornar el hecho; ya viene bastante decorado.',
  'cpu:KNIGHT_FORK': (count) => count > 1
    ? `${count} horquillas de caballo sufridas. Mis caballos ya conocen la ruta.`
    : 'Hay una horquilla de caballo reciente en el expediente. Limpia. Desagradable. Eficaz.',
  'cpu:PAWN_FORK': (count) => count > 1
    ? `${count} horquillas de peón. Una pieza de una casilla te está haciendo estadísticas.`
    : 'Una horquilla de peón ha entrado en el expediente. Humilde y ofensivamente eficaz.',
  'human:MATE_FOUND': (count) => count > 1
    ? `${count} mates encontrados. Sehr gut. Resulta que mirar amenazas funciona.`
    : 'Encontraste el mate cuando estaba ahí. Correcto. Casi profesional.',
  'human:PAWN_TAKES_QUEEN': (count) => count > 1
    ? `${count} damas capturadas por tus peones. Empiezo a respetar a esos pequeños cabrones.`
    : 'Uno de tus peones capturó una dama. Admito que fue desagradablemente elegante.',
  'human:QUEEN_CAPTURE': (count) => count > 1
    ? `${count} capturas decisivas de dama registradas. Hay progreso que hasta yo puedo leer.`
    : 'Hay una captura decisiva de dama en el expediente. Bien. No voy a repetirlo.',
});

function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function incidentVisit(episode) {
  const evidence = episode?.evidence;
  if (evidence?.source !== 'noteworthy_incidents') return null;
  const render = INCIDENT_COPY[evidence.key];
  const count = finiteCount(evidence.count);
  if (!render || !count) return null;
  return {
    kind: 'episodic-incident',
    text: render(count),
    action: 'train',
    actionLabel: 'Entrenar ese error',
    episodeFingerprint: episode.fingerprint,
  };
}

function rivalryVisit(episode) {
  const evidence = episode?.evidence;
  if (evidence?.source !== 'cpu_rivalry') return null;
  const gameNumber = finiteCount(evidence.game_number);
  if (evidence.outcome === 'win') {
    return {
      kind: 'episodic-rivalry',
      text: `${gameNumber ? `En nuestra partida ${gameNumber}, ` : ''}me ganaste. Está registrado. No confundas registro con entusiasmo.`,
      action: 'play',
      actionLabel: 'Otra partida',
      episodeFingerprint: episode.fingerprint,
    };
  }
  if (evidence.outcome === 'loss') {
    return {
      kind: 'episodic-rivalry',
      text: `${gameNumber ? `En nuestra partida ${gameNumber}, ` : ''}gané yo. El expediente no necesita comentarios adicionales, pero yo sí los disfruto.`,
      action: 'play',
      actionLabel: 'Pedir revancha',
      episodeFingerprint: episode.fingerprint,
    };
  }
  return null;
}

function openingVisit(episode) {
  const evidence = episode?.evidence;
  if (evidence?.source !== 'openings' || evidence.outcome !== 'loss') return null;
  const opening = String(evidence.opening || '').trim().slice(0, 100);
  const games = finiteCount(evidence.games);
  const losses = finiteCount(evidence.losses);
  if (!opening || games < 3 || losses < 2) return null;
  return {
    kind: 'episodic-opening',
    text: `${opening} vuelve a cobrar peaje: ${losses} derrotas en ${games} partidas registradas. Quizá ya podamos llamarlo asunto pendiente.`,
    action: 'insights',
    actionLabel: 'Revisar apertura',
    episodeFingerprint: episode.fingerprint,
  };
}

export function buildMatthiasEpisodicHomeVisit(memory = null) {
  const candidates = Array.isArray(memory?.episodicMemory?.callbackCandidates)
    ? memory.episodicMemory.callbackCandidates
    : [];
  for (const candidate of candidates.slice(0, 3)) {
    const episode = candidate?.episode;
    if (!episode || typeof episode !== 'object') continue;
    const visit = incidentVisit(episode)
      || rivalryVisit(episode)
      || openingVisit(episode);
    if (visit) return visit;
  }
  return null;
}

export function isMatthiasEpisodicVisitKind(kind) {
  return typeof kind === 'string' && kind.startsWith('episodic-');
}
