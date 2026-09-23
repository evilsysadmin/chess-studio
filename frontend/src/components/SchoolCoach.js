function countLabel(count) {
  return count === 1 ? 'una vez' : `${count} veces`;
}

export function advanceSchoolCoachContext(previous, kind) {
  const normalized = String(kind || 'neutral');
  const same = previous?.kind === normalized;
  return Object.freeze({
    kind: normalized,
    count: same ? Number(previous?.count || 0) + 1 : 1,
  });
}

export function schoolCoachMissMessage({
  lesson,
  kind,
  square = null,
  selected = null,
  expected = null,
  repeatCount = 1,
} = {}) {
  const exam = Boolean(lesson?.exam);
  const repeated = Number(repeatCount) > 1;

  if (kind === 'empty-square') {
    if (exam) return repeated
      ? 'Otra casilla vacía. El examen sigue sin conceder pistas por insistencia.'
      : 'Esa casilla está vacía. Sigue buscando; en examen no voy a señalarte la pieza.';
    return repeated
      ? `Otra casilla vacía. ${expected?.from || 'La pieza correcta'} sigue exactamente donde estaba, admirablemente paciente.`
      : `${square || 'Esa casilla'} está vacía. Empieza por la pieza de ${expected?.from || 'origen'}, no por una parcela del tablero.`;
  }

  if (kind === 'wrong-piece') {
    if (exam) return repeated
      ? 'Otra pieza equivocada. No, repetir el método no convierte esto en una pista.'
      : 'Esa pieza no inicia la solución. Es examen: te toca localizar la correcta.';
    return repeated
      ? `Seguimos cambiando de pieza. Este paso empieza en ${expected?.from}; no hace falta movilizar el resto del ejército.`
      : `Has elegido ${square}. Este paso empieza en ${expected?.from}. Mira la posición antes de reclutar voluntarios.`;
  }

  if (kind === 'illegal-target') {
    const route = selected && square ? `${selected}→${square}` : 'Ese salto';
    return repeated
      ? `Otra vez fuera del mapa legal. ${route} sigue sin convertirse en una jugada por pura perseverancia.`
      : `${route} no es legal. Las casillas iluminadas son el mapa real, no una sugerencia artística.`;
  }

  if (kind === 'off-objective') {
    if (exam) return repeated
      ? 'Otra jugada legal que no resuelve la posición. Legal no significa correcta.'
      : 'La jugada es legal, pero no resuelve el examen. Sigue calculando.';
    const target = expected?.from && expected?.to ? `${expected.from}→${expected.to}` : 'la secuencia marcada';
    return repeated
      ? `Otra desviación perfectamente legal. También perfectamente inútil para este ejercicio: buscamos ${target}.`
      : `Legal, sí. Pero esta lección pide ${target}. El reglamento te absuelve; Matthias todavía no.`;
  }

  return 'Eso no resuelve este paso. Revisa la posición y vuelve a intentarlo.';
}

export function schoolCoachSelectionMessage({ square, mistakes = 0, totalMoves = 1, step = 1 } = {}) {
  const misses = Math.max(0, Number(mistakes) || 0);
  if (misses > 0) {
    return `Ahora sí: ${square}. Tras ${countLabel(misses)} dando rodeos, ya tenemos la pieza correcta. Las casillas iluminadas son sus destinos legales · paso ${step}/${totalMoves}.`;
  }
  return `${square} seleccionado. Las casillas iluminadas son sus destinos legales. Ejecuta el paso ${step} de ${totalMoves}.`;
}

export function schoolCoachHintMessage(lesson) {
  return `${lesson?.hint || 'Mira la geometría de la posición.'} Te lo marco en el tablero; procura no convertir la pista en mobiliario permanente.`;
}

export function schoolCoachStepMessage({ autoReplies = 0, note = null, mistakes = 0, nextStep = 1, totalMoves = 1 } = {}) {
  const recovered = Number(mistakes) > 0 ? ' Ahora sí; el tropiezo anterior ya está corregido.' : '';
  const reply = autoReplies ? 'Bien. El rival ha respondido.' : 'Bien.';
  const continuation = note || `Sigue con la secuencia: movimiento ${nextStep} de ${totalMoves}.`;
  return `${reply}${recovered} ${continuation} No improvises una ópera todavía.`;
}
