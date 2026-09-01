export function warRoomDecorProfile(coarsePointer = false) {
  if (!coarsePointer) {
    return Object.freeze({
      bankerLamp: 3.8,
      wallSconce: 4.5,
      crest: 8.5,
      moon: 2.2,
      palette: 2.3,
      curtainLight: 0x5b2028,
      curtainDark: 0x2e1015,
      banner: 0x171c2a,
    });
  }

  // En móvil la resolución, el tone mapping y la geometría compacta aplastan
  // mucho los negros del fondo. Recuperamos sólo la iluminación del decorado:
  // estas luces están pegadas a la pared y no suben la exposición global ni
  // vuelven a quemar las piezas claras.
  return Object.freeze({
    bankerLamp: 2.9,
    wallSconce: 3.7,
    crest: 7.8,
    moon: 2.5,
    palette: 2.7,
    curtainLight: 0x6b2a34,
    curtainDark: 0x3d171e,
    banner: 0x252e43,
  });
}
