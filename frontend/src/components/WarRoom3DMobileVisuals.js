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
  // los fondos y el antiguo burdeos terminaba pareciendo rojo/negro. Conserva
  // la identidad teutónica, pero mueve el decorado hacia oliva, pizarra cálida,
  // latón y verde grisáceo para separar mejor la sala de las piezas.
  return Object.freeze({
    bankerLamp: 3.0,
    wallSconce: 3.8,
    crest: 8.0,
    moon: 2.7,
    palette: 2.9,
    curtainLight: 0x596650,
    curtainDark: 0x354039,
    banner: 0x40564f,
  });
}
