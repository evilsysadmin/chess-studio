import bB from './pieces-medieval/bB.png';
import bK from './pieces-medieval/bK.png';
import bN from './pieces-medieval/bN.png';
import bP from './pieces-medieval/bP.png';
import bQ from './pieces-medieval/bQ.png';
import bR from './pieces-medieval/bR.png';
import wB from './pieces-medieval/wB.png';
import wK from './pieces-medieval/wK.png';
import wN from './pieces-medieval/wN.png';
import wP from './pieces-medieval/wP.png';
import wQ from './pieces-medieval/wQ.png';
import wR from './pieces-medieval/wR.png';
import bB_azul from './pieces-medieval-azul/bB.png';
import bK_azul from './pieces-medieval-azul/bK.png';
import bN_azul from './pieces-medieval-azul/bN.png';
import bP_azul from './pieces-medieval-azul/bP.png';
import bQ_azul from './pieces-medieval-azul/bQ.png';
import bR_azul from './pieces-medieval-azul/bR.png';
import wB_azul from './pieces-medieval-azul/wB.png';
import wK_azul from './pieces-medieval-azul/wK.png';
import wN_azul from './pieces-medieval-azul/wN.png';
import wP_azul from './pieces-medieval-azul/wP.png';
import wQ_azul from './pieces-medieval-azul/wQ.png';
import wR_azul from './pieces-medieval-azul/wR.png';
import bB_esmeralda from './pieces-medieval-esmeralda/bB.png';
import bK_esmeralda from './pieces-medieval-esmeralda/bK.png';
import bN_esmeralda from './pieces-medieval-esmeralda/bN.png';
import bP_esmeralda from './pieces-medieval-esmeralda/bP.png';
import bQ_esmeralda from './pieces-medieval-esmeralda/bQ.png';
import bR_esmeralda from './pieces-medieval-esmeralda/bR.png';
import wB_esmeralda from './pieces-medieval-esmeralda/wB.png';
import wK_esmeralda from './pieces-medieval-esmeralda/wK.png';
import wN_esmeralda from './pieces-medieval-esmeralda/wN.png';
import wP_esmeralda from './pieces-medieval-esmeralda/wP.png';
import wQ_esmeralda from './pieces-medieval-esmeralda/wQ.png';
import wR_esmeralda from './pieces-medieval-esmeralda/wR.png';
import bB_studio from './pieces-studio/bB.png';
import bK_studio from './pieces-studio/bK.png';
import bN_studio from './pieces-studio/bN.png';
import bP_studio from './pieces-studio/bP.png';
import bQ_studio from './pieces-studio/bQ.png';
import bR_studio from './pieces-studio/bR.png';
import wB_studio from './pieces-studio/wB.png';
import wK_studio from './pieces-studio/wK.png';
import wN_studio from './pieces-studio/wN.png';
import wP_studio from './pieces-studio/wP.png';
import wQ_studio from './pieces-studio/wQ.png';
import wR_studio from './pieces-studio/wR.png';
import { GENERATED_PIECE_IMAGES_BY_SKIN } from './generatedPieceSkins.js';

export const BOARD3D_PIECE_IMAGES_BY_SKIN = Object.freeze({
  default: {
    p: bP, n: bN, b: bB, r: bR, q: bQ, k: bK,
    P: wP, N: wN, B: wB, R: wR, Q: wQ, K: wK,
  },
  azul: {
    p: bP_azul, n: bN_azul, b: bB_azul, r: bR_azul, q: bQ_azul, k: bK_azul,
    P: wP_azul, N: wN_azul, B: wB_azul, R: wR_azul, Q: wQ_azul, K: wK_azul,
  },
  esmeralda: {
    p: bP_esmeralda, n: bN_esmeralda, b: bB_esmeralda, r: bR_esmeralda, q: bQ_esmeralda, k: bK_esmeralda,
    P: wP_esmeralda, N: wN_esmeralda, B: wB_esmeralda, R: wR_esmeralda, Q: wQ_esmeralda, K: wK_esmeralda,
  },
  studio: {
    p: bP_studio, n: bN_studio, b: bB_studio, r: bR_studio, q: bQ_studio, k: bK_studio,
    P: wP_studio, N: wN_studio, B: wB_studio, R: wR_studio, Q: wQ_studio, K: wK_studio,
  },
  ...GENERATED_PIECE_IMAGES_BY_SKIN,
});

export function board3dPieceImages(skin) {
  return BOARD3D_PIECE_IMAGES_BY_SKIN[skin] || BOARD3D_PIECE_IMAGES_BY_SKIN.default;
}
