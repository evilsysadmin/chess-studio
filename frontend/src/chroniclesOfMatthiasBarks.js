function speakerFromParty(state, preferredId) {
  const party = Array.isArray(state?.party) ? state.party : [];
  const preferred = party.find((member) => member.id === preferredId && member.hp > 0);
  const speaker = preferred || party.find((member) => member.hp > 0);
  if (!speaker) return null;
  return { speakerId: speaker.id, speaker: speaker.name, glyph: speaker.glyph };
}

function bark(state, preferredId, text, event) {
  const speaker = speakerFromParty(state, preferredId);
  return speaker ? { ...speaker, text, event } : null;
}

export function chroniclesPartyBark(previous, next) {
  if (!previous || !next) return null;

  const fallen = next.party?.find((member) => {
    const before = previous.party?.find((candidate) => candidate.id === member.id);
    return before && before.hp > 0 && member.hp <= 0;
  });
  if (fallen) {
    const preferred = fallen.id === 'matthias' ? 'rook' : 'matthias';
    return bark(next, preferred, `${fallen.name} ha caído. Seguimos vivos primero; la épica ya rellenará el informe.`, `down:${fallen.id}`);
  }

  if (!previous.sigilAwake && next.sigilAwake) {
    return bark(next, 'bishop', 'Ese sello no estaba dormido. Sólo estaba esperando público.', 'sigil-awake');
  }
  if (previous.enemyHp > 0 && next.enemyHp <= 0) {
    return bark(next, 'rook', 'Uno menos. Si alguien quiere pronunciar un discurso, que lo haga andando.', 'corrupted-pawn-down');
  }
  if (previous.spectralBishopHp > 0 && next.spectralBishopHp <= 0) {
    return bark(next, 'bishop', 'Mi farol. La próxima vez que una aparición lo robe, pienso cobrar alquiler.', 'spectral-bishop-down');
  }
  if (previous.jailerHp > 0 && next.jailerHp <= 0) {
    return bark(next, 'rook', 'La torre ha cedido. No confundáis una puerta abierta con una invitación.', 'gate-jailer-down');
  }
  if (previous.scavengerHp > 0 && next.scavengerHp <= 0) {
    return bark(next, 'knight', 'Llave recuperada. Inventario reconciliado. Milagro logístico certificado.', 'scavenger-knight-down');
  }
  if (previous.phase !== 'escaped' && next.phase === 'escaped') {
    return bark(next, 'matthias', 'Consta en acta: salir con piezas todavía enteras cuenta como brillante estrategia.', 'escaped');
  }
  return null;
}
