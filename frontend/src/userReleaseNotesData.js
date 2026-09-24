// Novedades para jugadores. Pocas entradas, en lenguaje de jugador: qué puedes hacer ahora.
// Sin infraestructura, nombres internos ni recuentos. Lo antiguo vive en userReleaseNotesArchive.js.
//
// Cada entrada: id estable (la primera debe coincidir con LATEST_USER_NOTE_ID), fecha, título,
// 2-4 highlights y, opcionalmente, una acción «Verlo» (`close` sólo cierra el panel; el resto
// navega): 'close' | 'daily' | 'history' | 'progress'.
export const USER_RELEASE_NOTES = Object.freeze([
  {
    id: '2026-09-24-novedades',
    date: '2026-09-24',
    title: 'Novedades sin ruido',
    highlights: [
      'Arriba ves tu racha y el reto de hoy, con un botón para ir directo.',
      'Una lista corta de lo último que puedes usar, en lenguaje llano, y unos trucos para moverte más rápido.',
      'El aviso «Nuevo» sólo se enciende cuando de verdad hay algo nuevo que leer.',
    ],
    action: { label: 'Ver mi progreso', to: 'progress' },
  },
  {
    id: '2026-09-24-mazmorras',
    date: '2026-09-24',
    title: 'Mazmorras, ordenadas y con recomendación',
    highlights: [
      'Al abrirlas, «Hoy te toca» te sugiere qué hacer: el desafío diario si te falta, o tus puzzles personales.',
      'El resto está agrupado en Entrenar, Modos libres y Laboratorio, con una línea que explica cada cosa.',
      'Espectador y Mi progreso siguen a mano, más discretos.',
    ],
    action: { label: 'Ver el desafío de hoy', to: 'daily' },
  },
  {
    id: '2026-09-24-jugar',
    date: '2026-09-24',
    title: 'Jugar en un toque; lo demás, a un clic',
    highlights: [
      'JUGAR (o CONTINUAR si tienes una partida a medias) empieza sin pasos extra.',
      'Debajo, «Más formas de jugar» reúne el 1 contra 1 con rivales conectados y la partida de práctica.',
    ],
    action: { label: 'Verlo', to: 'close' },
  },
  {
    id: '2026-09-24-sala',
    date: '2026-09-24',
    title: 'La sala te dice dónde pulsar',
    highlights: [
      'Cada destino tiene una baliza sobre su objeto: la copa (Torneos), la biblioteca (Entrenar), la armadura (Combat Chess), la chimenea (Desafío diario), el rincón de estudio (Historia) y la escalera (Mazmorras).',
      'Pasa el ratón para ver su nombre. «Accesos rápidos», arriba en el centro, te lleva a cualquier sitio sin buscar el objeto.',
    ],
    action: { label: 'Verlo', to: 'close' },
  },
  {
    id: '2026-09-24-castillo',
    date: '2026-09-24',
    title: 'El castillo, más vivo',
    highlights: [
      'Candelabro en la mesa, taza con humo, llamas que ondean y candelabros de pared que explican de dónde viene la luz de la biblioteca.',
      'Armadura nueva, más robusta y articulada; una silla por lado en la mesa; farolillos cerrados en la escalera.',
      'Un pergamino sellado sobre la chimenea marca el reto del día.',
    ],
  },
]);
