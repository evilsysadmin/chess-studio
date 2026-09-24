export function advanceSchoolCoachContext(previous, kind) {
  const normalized = String(kind || 'neutral');
  return Object.freeze({
    kind: normalized,
    count: previous?.kind === normalized ? Number(previous?.count || 0) + 1 : 1,
  });
}

export function schoolCoachMissMessage({
  lesson,
  kind,
  square = null,
  selected = null,
  expected = null,
  repeatCount = 1,
  revealExpected = true,
} = {}) {
  const exam = Boolean(lesson?.exam);
  const repeated = Number(repeatCount) > 1;
  const canReveal = revealExpected && !exam;
  const expectedFrom = canReveal ? expected?.from : null;
  const expectedRoute = canReveal && expected?.from && expected?.to
    ? `${expected.from}→${expected.to}`
    : null;

  if (kind === 'empty-square') {
    if (!canReveal) {
      return repeated
        ? 'Otra casilla vacía. Insistir no va a materializar una pieza ahí.'
        : `${square || 'Esa casilla'} está vacía. Busca una pieza que pueda resolver el paso.`;
    }
    return repeated
      ? `Otra casilla vacía. La pieza de ${expectedFrom || 'origen'} sigue esperando con una paciencia ofensiva.`
      : `${square || 'Esa casilla'} está vacía. Este paso empieza en ${expectedFrom || 'la pieza marcada'}, no en una parcela libre.`;
  }

  if (kind === 'wrong-piece') {
    if (!canReveal) {
      return repeated
        ? 'Otra pieza equivocada. Cambiar de voluntario no cambia la posición.'
        : 'Esa pieza no inicia la solución. Mira amenazas, geometría y turno antes de elegir.';
    }
    return repeated
      ? `Otra pieza distinta, mismo problema. Este paso empieza en ${expectedFrom}.`
      : `Has elegido ${square}. Para este paso, mira la pieza de ${expectedFrom}.`;
  }

  if (kind === 'illegal-target') {
    const route = selected && square ? `${selected}→${square}` : 'Ese salto';
    return repeated
      ? `${route} sigue sin ser legal. La perseverancia tiene límites reglamentarios.`
      : `${route} no es legal. Revisa los destinos disponibles de la pieza.`;
  }

  if (kind === 'off-objective') {
    if (!expectedRoute) {
      return repeated
        ? 'Otra jugada legal que no resuelve el objetivo. Legal no significa útil.'
        : 'La jugada es legal, pero no resuelve esta posición. Sigue calculando.';
    }
    return repeated
      ? `Otra desviación perfectamente legal. Seguimos buscando ${expectedRoute}.`
      : `Legal, sí. Esta lección pide ${expectedRoute}. El reglamento te absuelve; Matthias todavía no.`;
  }

  return 'Eso no resuelve este paso. Revisa la posición y vuelve a intentarlo.';
}

export function schoolCoachSelectionMessage({ square, hadRecentMiss = false, totalMoves = 1, step = 1 } = {}) {
  if (hadRecentMiss) {
    return `Ahora sí: ${square}. Ya tenemos la pieza correcta. Sus destinos legales están iluminados · paso ${step}/${totalMoves}.`;
  }
  return `${square} seleccionado. Sus destinos legales están iluminados. Ejecuta el paso ${step} de ${totalMoves}.`;
}

export function schoolCoachHintMessage(lesson) {
  return `${lesson?.hint || 'Mira la geometría de la posición.'} Te lo marco en el tablero; procura no convertir la pista en mobiliario permanente.`;
}

export function schoolCoachStepMessage({
  autoReplies = 0,
  note = null,
  recovered = false,
  nextStep = 1,
  totalMoves = 1,
} = {}) {
  const reply = autoReplies ? 'Bien. El rival ha respondido.' : 'Bien.';
  const recovery = recovered ? ' El tropiezo anterior ya está corregido.' : '';
  const continuation = note || `Sigue con la secuencia: movimiento ${nextStep} de ${totalMoves}.`;
  return `${reply}${recovery} ${continuation} No improvises una ópera todavía.`;
}
