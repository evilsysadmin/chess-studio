import { normalizeWarRoomVariant, warRoomVariantDomData } from './WarRoomVariant.js';

const TACTICAL_PLAY = 'Tablero de ajedrez 3D en Sala de guerra. Cámara táctica fija desde tu lado. Usa flechas y Enter para jugar con teclado.';
const TACTICAL_INSPECT = 'Tablero de ajedrez 3D en Sala de guerra. Inspección activa. Usa flechas para mover la cámara, Inicio para centrarla y Escape para volver a jugar.';
const CLASSROOM_PLAY = 'Tablero de ajedrez 3D en Class Room. Cámara docente fija y cercana. Usa flechas y Enter para jugar con teclado.';
const CLASSROOM_INSPECT = 'Tablero de ajedrez 3D en Class Room. Inspección activa. Usa flechas para mover la cámara, Inicio para centrarla y Escape para volver a jugar.';

export function resolveBoard3DPresentation({
  cameraProfile = 'tactical',
  variantOverride = null,
  globalVariant = 'classic',
  globalDomData = {},
  variantStatus = 'idle',
} = {}) {
  const classroom = cameraProfile === 'classroom';
  const variant = variantOverride ? normalizeWarRoomVariant(variantOverride) : globalVariant;
  return Object.freeze({
    classroom,
    variant,
    domData: variantOverride ? warRoomVariantDomData(variant, variantStatus) : globalDomData,
    playAriaLabel: classroom ? CLASSROOM_PLAY : TACTICAL_PLAY,
    inspectAriaLabel: classroom ? CLASSROOM_INSPECT : TACTICAL_INSPECT,
    cameraData: classroom ? 'classroom-overhead' : 'fixed-tactical',
    roomLabel: classroom ? 'CLASS ROOM' : 'SALA DE GUERRA',
    cameraLabel: classroom ? 'CÁMARA DOCENTE' : 'CÁMARA TÁCTICA',
  });
}
