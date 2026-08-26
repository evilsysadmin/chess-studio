import regB from './pieces-regimiento/bB.png'; import regK from './pieces-regimiento/bK.png'; import regN from './pieces-regimiento/bN.png'; import regP from './pieces-regimiento/bP.png'; import regQ from './pieces-regimiento/bQ.png'; import regR from './pieces-regimiento/bR.png';
import regWB from './pieces-regimiento/wB.png'; import regWK from './pieces-regimiento/wK.png'; import regWN from './pieces-regimiento/wN.png'; import regWP from './pieces-regimiento/wP.png'; import regWQ from './pieces-regimiento/wQ.png'; import regWR from './pieces-regimiento/wR.png';
import shoB from './pieces-shogunate/bB.png'; import shoK from './pieces-shogunate/bK.png'; import shoN from './pieces-shogunate/bN.png'; import shoP from './pieces-shogunate/bP.png'; import shoQ from './pieces-shogunate/bQ.png'; import shoR from './pieces-shogunate/bR.png';
import shoWB from './pieces-shogunate/wB.png'; import shoWK from './pieces-shogunate/wK.png'; import shoWN from './pieces-shogunate/wN.png'; import shoWP from './pieces-shogunate/wP.png'; import shoWQ from './pieces-shogunate/wQ.png'; import shoWR from './pieces-shogunate/wR.png';
import cyB from './pieces-cyber/bB.png'; import cyK from './pieces-cyber/bK.png'; import cyN from './pieces-cyber/bN.png'; import cyP from './pieces-cyber/bP.png'; import cyQ from './pieces-cyber/bQ.png'; import cyR from './pieces-cyber/bR.png';
import cyWB from './pieces-cyber/wB.png'; import cyWK from './pieces-cyber/wK.png'; import cyWN from './pieces-cyber/wN.png'; import cyWP from './pieces-cyber/wP.png'; import cyWQ from './pieces-cyber/wQ.png'; import cyWR from './pieces-cyber/wR.png';
import marB from './pieces-marines/bB.png'; import marK from './pieces-marines/bK.png'; import marN from './pieces-marines/bN.png'; import marP from './pieces-marines/bP.png'; import marQ from './pieces-marines/bQ.png'; import marR from './pieces-marines/bR.png';
import marWB from './pieces-marines/wB.png'; import marWK from './pieces-marines/wK.png'; import marWN from './pieces-marines/wN.png'; import marWP from './pieces-marines/wP.png'; import marWQ from './pieces-marines/wQ.png'; import marWR from './pieces-marines/wR.png';
import delB from './pieces-delta/bB.png'; import delK from './pieces-delta/bK.png'; import delN from './pieces-delta/bN.png'; import delP from './pieces-delta/bP.png'; import delQ from './pieces-delta/bQ.png'; import delR from './pieces-delta/bR.png';
import delWB from './pieces-delta/wB.png'; import delWK from './pieces-delta/wK.png'; import delWN from './pieces-delta/wN.png'; import delWP from './pieces-delta/wP.png'; import delWQ from './pieces-delta/wQ.png'; import delWR from './pieces-delta/wR.png';

function set(bP, bN, bB, bR, bQ, bK, wP, wN, wB, wR, wQ, wK) {
  return { p: bP, n: bN, b: bB, r: bR, q: bQ, k: bK, P: wP, N: wN, B: wB, R: wR, Q: wQ, K: wK };
}

export const GENERATED_PIECE_IMAGES_BY_SKIN = {
  regimiento: set(regP, regN, regB, regR, regQ, regK, regWP, regWN, regWB, regWR, regWQ, regWK),
  shogunate: set(shoP, shoN, shoB, shoR, shoQ, shoK, shoWP, shoWN, shoWB, shoWR, shoWQ, shoWK),
  cyber: set(cyP, cyN, cyB, cyR, cyQ, cyK, cyWP, cyWN, cyWB, cyWR, cyWQ, cyWK),
  marines: set(marP, marN, marB, marR, marQ, marK, marWP, marWN, marWB, marWR, marWQ, marWK),
  delta: set(delP, delN, delB, delR, delQ, delK, delWP, delWN, delWB, delWR, delWQ, delWK),
};

export const GENERATED_SKIN_PREVIEWS = {
  regimiento: [regWN, regN],
  shogunate: [shoWN, shoN],
  cyber: [cyWN, cyN],
  marines: [marWN, marN],
  delta: [delWN, delN],
};
