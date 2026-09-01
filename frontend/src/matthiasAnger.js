import { Chess } from 'chess.js';

export const MATTHIAS_CAPTURE_VALUES = Object.freeze({
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
});

export function angerLevelForMaterial(material = 0) {
  const score = Math.max(0, Number(material) || 0);
  if (score >= 9) return 4;
  if (score >= 6) return 3;
  if (score >= 3) return 2;
  if (score >= 1) return 1;
  return 0;
}

/**
 * Reconstruye capturas del humano desde el historial real de la partida.
 * No inventamos material si un historial especial no puede reproducirse desde
 * la posición inicial estándar: en ese caso devolvemos reconstructable=false.
 */
export function matthiasAngerState(history = [], humanColor = 'w') {
  if (!Array.isArray(history) || !['w', 'b'].includes(humanColor)) {
    return { material: 0, level: 0, latestHumanCapture: null, reconstructable: false };
  }

  const chess = new Chess();
  let material = 0;
  let latestHumanCapture = null;

  for (let index = 0; index < history.length; index += 1) {
    const record = history[index];
    if (!record?.san) {
      return { material: 0, level: 0, latestHumanCapture: null, reconstructable: false };
    }

    let move;
    try {
      move = chess.move(record.san);
    } catch {
      move = null;
    }
    if (!move) {
      return { material: 0, level: 0, latestHumanCapture: null, reconstructable: false };
    }

    if (move.color === humanColor && move.captured && MATTHIAS_CAPTURE_VALUES[move.captured]) {
      const value = MATTHIAS_CAPTURE_VALUES[move.captured];
      material += value;
      latestHumanCapture = {
        id: `${index + 1}:${move.from}${move.to}:${move.captured}`,
        ply: index + 1,
        piece: move.captured,
        value,
        from: move.from,
        to: move.to,
        san: move.san,
      };
    }
  }

  return {
    material,
    level: angerLevelForMaterial(material),
    latestHumanCapture,
    reconstructable: true,
  };
}
