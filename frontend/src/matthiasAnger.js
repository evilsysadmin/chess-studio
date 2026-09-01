import { Chess } from 'chess.js';

export const MATTHIAS_CAPTURE_VALUES = Object.freeze({
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
});

const CAPTURE_REACTION_LINES = Object.freeze({
  p: [
    'Un peón. Celebre la calderilla si le hace ilusión.',
    'Ha tocado a uno de mis peones. Anotado.',
    'Un peón menos. No confunda contabilidad con victoria.',
  ],
  n: [
    'Mi caballo. Sehr gut. Acaba de encarecer esta partida.',
    'Ese caballo tenía trabajo. Ahora usted tiene mi atención.',
    'Un caballo menos. Empiezo a sospechar que ha venido a molestar de verdad.',
  ],
  b: [
    'Mi alfil. Qué detalle. Empiezo a tomar esto como una falta de educación.',
    'Ha desmontado un alfil. Ya puede borrar esa sonrisa.',
    'Ese alfil era útil. Usted acaba de volverse bastante menos simpático.',
  ],
  r: [
    'Una torre. Ah. Eso sí ha dolido, cabronazo.',
    'Mi torre. Magnífico. Ahora sí estamos hablando de asuntos personales.',
    'Una torre fuera. Sehr schön. Acaba de subir la temperatura de la sala.',
  ],
  q: [
    'Mi dama. Wunderbar. Acaba de convertir esto en un asunto personal.',
    'La dama. Muy bien. El café se ha terminado; ahora viene la artillería.',
    'Ha capturado mi dama. Disfrute del momento. Será breve.',
  ],
});

export function angerLevelForMaterial(material = 0) {
  const score = Math.max(0, Number(material) || 0);
  if (score >= 9) return 4;
  if (score >= 6) return 3;
  if (score >= 3) return 2;
  if (score >= 1) return 1;
  return 0;
}

function captureRecord(index, move) {
  return {
    id: `${index + 1}:${move.from}${move.to}:${move.captured}`,
    ply: index + 1,
    piece: move.captured,
    value: MATTHIAS_CAPTURE_VALUES[move.captured] || 0,
    from: move.from,
    to: move.to,
    san: move.san,
  };
}

/**
 * Reconstruye capturas desde el historial real de la partida.
 * No inventamos material si un historial especial no puede reproducirse desde
 * la posición inicial estándar: en ese caso devolvemos reconstructable=false.
 */
export function matthiasAngerState(history = [], humanColor = 'w') {
  if (!Array.isArray(history) || !['w', 'b'].includes(humanColor)) {
    return {
      material: 0,
      level: 0,
      latestHumanCapture: null,
      latestCpuCapture: null,
      reconstructable: false,
    };
  }

  const chess = new Chess();
  let material = 0;
  let latestHumanCapture = null;
  let latestCpuCapture = null;

  for (let index = 0; index < history.length; index += 1) {
    const record = history[index];
    if (!record?.san) {
      return {
        material: 0,
        level: 0,
        latestHumanCapture: null,
        latestCpuCapture: null,
        reconstructable: false,
      };
    }

    let move;
    try {
      move = chess.move(record.san);
    } catch {
      move = null;
    }
    if (!move) {
      return {
        material: 0,
        level: 0,
        latestHumanCapture: null,
        latestCpuCapture: null,
        reconstructable: false,
      };
    }

    if (!move.captured || !MATTHIAS_CAPTURE_VALUES[move.captured]) continue;

    if (move.color === humanColor) {
      const capture = captureRecord(index, move);
      material += capture.value;
      latestHumanCapture = capture;
    } else {
      latestCpuCapture = captureRecord(index, move);
    }
  }

  return {
    material,
    level: angerLevelForMaterial(material),
    latestHumanCapture,
    latestCpuCapture,
    reconstructable: true,
  };
}

export function shouldMatthiasReactToCapture(capture, previous = null, now = Date.now()) {
  if (!capture?.id || !capture?.piece) return false;
  if (!previous?.at) return true;
  if (capture.piece === 'q') return true;

  const elapsed = Math.max(0, Number(now) - Number(previous.at || 0));
  const plyGap = Number(capture.ply || 0) - Number(previous.ply || 0);
  const minInterval = capture.piece === 'r' ? 7000 : 12000;
  return elapsed >= minInterval || plyGap >= 6;
}

export function matthiasCaptureReaction(piece, angerLevel = 0, random = Math.random) {
  const lines = CAPTURE_REACTION_LINES[piece] || CAPTURE_REACTION_LINES.p;
  const roll = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  const line = lines[Math.floor(roll * lines.length)];
  if (angerLevel >= 4 && piece !== 'q') return `${line} Ya ha conseguido que deje el café.`;
  return line;
}
