// spectatorReactions.js — capa ambiental deliberadamente escasa.
// A partir de un evento YA detectado como noteworthy decide si habla la CPU,
// el público, ambos o nadie. Es determinista para un mismo evento/ply: no
// cambia por re-render ni requiere almacenar estado adicional.

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const REACTIONS = {
  MATE_FOUND: ['«Eso sí que lo han visto todos.»', 'Un par de palmas. Nadie discute el mate.', '«Se acabó. Bonito cierre.»'],
  MISSED_MATE: ['Se oye un «no puede ser» desde el fondo.', 'Alguien tose con una violencia claramente crítica.', '«¿Ha dejado pasar el mate?»'],
  STALEMATE_BLUNDER: ['Silencio. Luego una risa aislada. Peor.', '«Eso estaba ganado…»', 'El público tarda un segundo en entender el ahogado. Después duele más.'],
  ALLOWED_MATE: ['«Uy.» Ese “uy” llevaba documentación adjunta.', 'Varias cabezas se giran hacia el tablero al mismo tiempo.', '«Tiene mate en una.»'],
  PAWN_TAKES_QUEEN: ['El público despierta de golpe. Un peón acaba de cobrar pieza mayor.', '«¡CON EL PEÓN!»', 'Hay ruido de sillas. Eso no pasa desapercibido.'],
  QUEEN_CAPTURE: ['Aplauso corto. La dama ha salido del inventario.', '«Eso cambia la partida.»', 'El público hace la cuenta de material sin calculadora.'],
  PROMOTION: ['Un murmullo crece mientras el peón llega al final.', '«Ha coronado.»', 'El humilde funcionario acaba de pedir despacho propio.'],
  KNIGHT_FORK: ['«Horquilla.» Lo dicen varios a la vez.', 'El caballo acaba de encontrar dos problemas con una sola nómina.', 'Se oye un silbido de aprobación. Geometría hostil.'],
  PAWN_FORK: ['«Ese peón está cobrando horas extra.»', 'Dos amenazas, un peón. El público sí lo ha visto.', 'Un peón acaba de crear una reunión de crisis.'],
  SKEWER: ['«Brocheta.» Alguien en primera fila está demasiado satisfecho.', 'El rey se aparta y detrás queda la factura.', 'Hay un murmullo de esos que preceden a perder material.'],
  DISCOVERED_CHECK: ['La línea se abre y el público reacciona antes que nadie.', '«Descubierto.»', 'Eso venía con sorpresa incorporada.'],
  QUEEN_EN_PRISE_TO_PAWN: ['«¿La dama está… al alcance de ese peón?»', 'El público ha detectado una reclamación laboral inminente.', 'Una dama y un peón se miran. Nadie confía en el departamento de riesgos.'],
  QUEEN_SACRIFICE_OFFER: ['El público deja de respirar un segundo.', '«¿Sacrificio… o accidente?»', 'Ahora sí: todo el mundo mira el tablero.'],
  ROOK_SACRIFICE_OFFER: ['«Esa torre no vuelve.»', 'Se oye un murmullo: puede ser sacrificio, puede ser papeleo funerario.', 'La torre entra donde normalmente no se recomienda aparcar.'],
  PAWN_TAKES_ROOK: ['«Otro ascenso para ese peón.»', 'Una torre menos. El peón presenta candidatura a veterano.', 'El público agradece la desproporción.'],
};

const GENERIC = ['El público murmura.', 'Varias miradas se clavan en el tablero.', 'Eso sí ha despertado a la grada.'];

function choose(lines, seed) {
  const list = lines?.length ? lines : GENERIC;
  return list[hash(seed) % list.length];
}

export function noteworthyPresentation(event, actor = 'human', ply = 0) {
  if (!event?.type || Number(event.priority || 0) < 60) return { cpu: false, audience: false, text: null, mode: 'silence' };
  const priority = Number(event.priority || 0);
  const roll = hash(`${event.type}|${actor}|${ply}`) % 100;

  let mode;
  if (priority >= 90) {
    if (roll < 28) mode = 'cpu';
    else if (roll < 54) mode = 'audience';
    else if (roll < 80) mode = 'both';
    else mode = 'silence';
  } else if (priority >= 72) {
    if (roll < 32) mode = 'cpu';
    else if (roll < 55) mode = 'audience';
    else if (roll < 70) mode = 'both';
    else mode = 'silence';
  } else {
    if (roll < 30) mode = 'cpu';
    else if (roll < 48) mode = 'audience';
    else if (roll < 58) mode = 'both';
    else mode = 'silence';
  }

  return {
    mode,
    cpu: mode === 'cpu' || mode === 'both',
    audience: mode === 'audience' || mode === 'both',
    // En una catástrofe humana, el silencio ocasional de Matthias es una
    // reacción deliberada, no ausencia de detección. La UI puede mostrar
    // únicamente su mirada y un «…», sin convertirlo en otra frase de chat.
    matthiasSilence: actor === 'human' && priority >= 90 && mode === 'silence',
    text: mode === 'audience' || mode === 'both' ? choose(REACTIONS[event.type], `${event.type}|${actor}|${ply}|line`) : null,
  };
}
