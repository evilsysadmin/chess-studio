import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

export const HOME_FIRST_RUN_TOUR_KEY = 'chess-study-home-tour-v1';
export const HOME_FIRST_RUN_TOUR_VERSION = '1';

export const HOME_FIRST_RUN_TOUR_STEPS = Object.freeze([
  {
    id: 'matthias',
    target: 'matthias',
    eyebrow: 'MATTHIAS · PRESENTACIÓN',
    title: 'Guten Morgen.',
    text: 'Soy Matthias. Rival, entrenador y archivista profesional de tus desastres. Chess Studio gira alrededor de jugar, entender qué pasó y volver al tablero un poco menos peligroso para ti mismo.',
  },
  {
    id: 'studio',
    target: null,
    eyebrow: 'CHESS STUDIO',
    title: 'Esto no es un menú con ajedrez pegado encima.',
    text: 'Aquí juegas, revisas incidentes reales de tus partidas y conviertes esos datos en entrenamiento. El castillo es la puerta de entrada; el tablero sigue siendo el centro de todo.',
  },
  {
    id: 'play',
    target: 'play',
    eyebrow: 'PRIMERA PARADA',
    title: 'JUGAR',
    text: 'La ruta corta. Entras, eliges lo imprescindible y te sientas frente al tablero. Si dejaste una partida a medias, este mismo lugar se convierte en CONTINUAR.',
  },
  {
    id: 'train',
    target: 'train',
    eyebrow: 'SEGUNDA PARADA',
    title: 'ENTRENAR',
    text: 'Escuela, aperturas y práctica guiada. Nada de leer un manual de trescientas páginas: eliges, mueves y recibes contexto sobre el tablero.',
  },
  {
    id: 'insights',
    target: 'matthias',
    eyebrow: 'TU EXPEDIENTE',
    title: 'ASÍ JUEGAS',
    text: 'Pulsa sobre mí para abrir tu expediente. Si digo que repites un error, será porque hay datos guardados que lo sostienen. Puedo ser un cabronazo; inventarme pruebas, no.',
  },
  {
    id: 'dungeon',
    target: 'dungeon',
    eyebrow: 'BAJO EL CASTILLO',
    title: 'MAZMORRAS',
    text: 'Aquí escondemos modos secundarios, herramientas y experimentos que no deben ensuciar la Home. Curiosea cuando quieras; no necesitas entenderlo todo hoy.',
  },
]);

export function homeFirstRunTourSeen() {
  return getStorageItem(STORAGE_LOCAL, HOME_FIRST_RUN_TOUR_KEY) === HOME_FIRST_RUN_TOUR_VERSION;
}

export function markHomeFirstRunTourSeen() {
  return setProfileStorageItem(HOME_FIRST_RUN_TOUR_KEY, HOME_FIRST_RUN_TOUR_VERSION);
}

export function shouldOfferHomeFirstRunTour({
  seen = homeFirstRunTourSeen(),
  blocked = false,
  hasSavedGame = false,
} = {}) {
  return !seen && !blocked && !hasSavedGame;
}
