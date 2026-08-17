// mirrorMode.js — "Espejo de ti mismo": una CPU calibrada para
// equivocarse con una frecuencia/magnitud parecida a la tuya, no un nivel
// fijo elegido a mano. Usa `worstMoveCache.js` (el único registro
// persistente de tus errores reales, ya juntado en rondas anteriores) —
// no es un motor de reconocimiento de PATRONES de error (eso pediría
// clasificar el TIPO de cada blunder: piezas colgadas, mates de espalda,
// etc. — mucho más trabajo del que se justifica acá); es una aproximación
// honesta: calibra qué tanto y qué tan grave se equivoca la CPU para que
// se parezca a tu propio promedio, usando el mismo mecanismo de "ruido"
// que ya existe en el motor para cualquier nivel de dificultad.

import { loadWorstMoveCache } from './worstMoveCache.js';

const MIN_GAMES_FOR_PROFILE = 3; // menos que esto, el promedio es poco confiable

// Junta los `worst.loss` de todas las partidas ya analizadas y cacheadas
// — es la única fuente de datos persistente sobre tus propios errores
// reales que existe en la app hasta ahora.
export function computeMirrorProfile() {
  const cache = loadWorstMoveCache();
  const losses = Object.values(cache)
    .map((entry) => entry?.worst?.loss)
    .filter((loss) => typeof loss === 'number' && Number.isFinite(loss));

  if (losses.length < MIN_GAMES_FOR_PROFILE) {
    return { ready: false, gamesSampled: losses.length, avgLoss: null, difficulty: null };
  }

  const avgLoss = losses.reduce((sum, l) => sum + l, 0) / losses.length;
  return { ready: true, gamesSampled: losses.length, avgLoss: Math.round(avgLoss), difficulty: mirrorDifficulty(avgLoss) };
}

// Cuanto más alta tu pérdida promedio (te equivocas más/peor), más floja
// la CPU espejo — para que blanda ese mismo tipo de error, no lo
// contrario. Los topes (5 y 95) evitan una CPU completamente inmóvil o
// perfecta, incluso en los extremos.
export function mirrorDifficulty(avgLoss) {
  return Math.max(5, Math.min(95, Math.round(100 - avgLoss / 5)));
}
