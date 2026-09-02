export function warRoomDecorProfile(coarsePointer = false) {
  if (!coarsePointer) {
    return Object.freeze({
      // Desktop v4: local practical lights carry the mood; the old broad cyan/teal
      // fills were washing out the brushed steel, gilding and canvas textures.
      bankerLamp: 3.45,
      wallSconce: 4.7,
      crest: 7.6,
      moon: 1.45,
      palette: 1.55,
      curtainLight: 0x552029,
      curtainDark: 0x291016,
      banner: 0x161b27,
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
