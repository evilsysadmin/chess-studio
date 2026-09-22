import { STRUCTURED_AMBIENT_THEMES } from './ambientStructuredCatalog.js';

// ambientCatalog.js — catálogo y constantes puras de la radio ambiental.
// Separado del motor WebAudio para que editar pistas no implique tocar transporte/síntesis.

export const KEY_CENTERS_SEMITONES = [0, 5, 1, 7]; // Do / Fa / Reb / Sol

export const OUD_SCALE = [130.81, 138.59, 164.81, 174.61, 195.99, 207.65, 233.08]; // C3 Db3 E3 F3 G3 Ab3 Bb3

// Contrabajo: una octava por debajo de OUD_SCALE, walking bass simple —
// nueva capa, para sumar color y un ancla armónica grave que hasta acá no
// existía (el pad sostiene acordes, esto camina por debajo marcando el
// pulso, más "jazz" que "drone").
const BASS_PATTERN = [0, 4, 0, 6]; // tónica, quinta, tónica, séptima bemol — un compás completo (4 pasos de negra)
export const BASS_STEP_GAP = 4; // una nota cada 4 dieciseisavos = pulso de negra
export const BASS_DURATION_S = 0.9;

// Índices dentro de OUD_SCALE, no frecuencias directas — cada frase es una
// forma melódica real, no una selección al azar.
const PHRASES = [
  [4, 3, 2, 0], // G F E C — carrerita descendente al reposo
  [0, 2, 4, 3], // C E G F — ascendente, cálida
  [0, 2, 4], // C E G — tríada mayor ascendente, cálida — nueva, para bajarle el filo a la escala
  [4, 2, 0], // G E C — misma tríada, descendente y directa — nueva
  [4, 5, 4], // G Ab G — el único giro que enfatiza la tensión de la 2a aumentada (antes había dos)
  [6, 4, 3, 2, 0], // Bb G F E C — carrerita descendente más larga
  [0, 3, 4], // C F G — subdominante a dominante, cálida
  [2, 4, 6, 4, 2], // E G Bb G E — arco simétrico, sube y baja, más variedad de contorno
  [3, 4, 6, 4], // F G Bb G — arco corto con el color de la séptima
];

// ---------- Pulso base compartido ----------
//
// Iteración 6: hasta acá cada capa tenía su propio intervalo suelto (pad
// cada 2100ms, punteo cada 1300ms, saxo cada 2800ms, percusión cada
// 650ms) — ninguno múltiplo limpio del otro, así que nada estaba
// realmente sincronizado a una grilla común. Eso era la causa real de
// que sonara "deslabazado": no importa cuán buena sea cada frase
// individual, si no comparten pulso, flotan unas contra otras en vez de
// sentirse como una sola banda tocando junta.
//
// Ahora todo deriva de un único STEP_MS (un dieciseisavo a ~107 BPM). La
// percusión pasa a patrones de 16 pasos estilo breakbeat (la base rítmica
// de un drum & bass, aunque a tempo bien más relajado — esto es fondo de
// menú, no una pista de baile) con bombo y caja en posiciones
// sincopadas, no solo "fuerte-silencio-suave-silencio". El punteo, el
// saxo y el pad ahora arrancan siempre en un límite de compás exacto.
const STEP_MS = 130; // grilla de dieciseisavos, ~115 BPM — antes 140ms/~107 BPM.
// Ajustado tras analizar con librosa (tempo, no melodía) una referencia de jazz árabe que
// compartió el usuario: tempo mediano ~129 BPM en los segmentos muestreados. No se llega
// hasta ahí (demasiado vivo para fondo de menú), pero se acerca un poco desde los 107 BPM.
export const STEPS_PER_BAR = 16;
const BAR_MS = STEP_MS * STEPS_PER_BAR; // 2240ms, un compás completo

export const PHRASE_NOTE_GAP_MS = STEP_MS * 2; // corcheas exactas: melodía y percusión comparten rejilla
const PLUCK_GAP_STEPS = 8; // cada medio compás intenta una frase
export const PLUCK_DURATION_S = 1.4;
const PLUCK_CHANCE = 0.7;

// El saxo toca licks más cortos y espaciados (legato, no punteado) — menos
// seguido que las cuerdas, para que se sienta como una voz solista que
// aparece de vez en cuando, no una tercera capa constante compitiendo.
const SAX_PHRASES = [
  [4], // una sola nota sostenida
  [0, 4], // tónica a quinta — cálida
  [6, 4], // séptima bemol bajando a la quinta
  [2, 0], // tercera mayor bajando a la tónica — cálida
  [3, 0], // subdominante bajando a la tónica — cálida, nueva
  [4, 6, 4], // giro corto legato alrededor de la quinta y la séptima — nueva
];
export const SAX_NOTE_GAP_MS = STEP_MS * 5; // fraseo amplio, cuantizado al mismo pulso
const SAX_GAP_STEPS = 32; // 2 compases exactos — antes eran 20, que NO es múltiplo de 16 (el compás):
// tardaba 4 compases en volver a alinearse con el patrón de percusión, entrando en un punto
// distinto cada vez — eso sonaba a "cada voz por su lado" aunque compartieran el mismo reloj.
export const SAX_DURATION_S = 2.3;
const SAX_CHANCE = 0.4;

// Subido una octava (antes C3/G3/Bb3, sonaba a "drone de sótano") — más
// arriba se siente cálido y presente, menos "algo acecha en la oscuridad".
// Ataque más corto también (antes 0.9s), para que no se sienta como algo
// apareciendo de la nada.
const PAD_NOTES = [261.63, 392.0, 466.16, 392.0]; // C4 G4 Bb4 G4 — tónica/quinta/séptima, una octava más arriba
export const PAD_GAP_STEPS = 16; // un compás completo por nota del pad
export const PAD_DURATION_S = 3.5; // bajado de 4.5 — menos sostenido/fantasmal
export const PAD_ATTACK_S = 0.5; // bajado de 0.9

// Patrones de batería de 16 pasos, estilo breakbeat (bombo/caja en
// posiciones sincopadas, no solo en los tiempos fuertes) — la base
// rítmica de un drum & bass, aunque a un tempo bien más relajado. 'D' es
// el "dum" grave (bombo), 'T' el "tak" agudo (caja/borde), '.' silencio.
// Cada patrón dura un compás completo (16 pasos = BAR_MS).
function parsePattern(str, dumVol, takVol) {
  return str.split('').map((c) => {
    if (c === 'D') return ['dum', dumVol];
    if (c === 't') return ['tak', takVol * 0.6]; // tak flojo, de relleno
    if (c === 'T') return ['tak', takVol];
    return null;
  });
}

const PERCUSSION_PATTERNS = [
  // Breakbeat clásico: bombo en 1 y en la sincopa antes del 3, caja en el
  // "and" del 2 y en el 4 -- el patrón base de un break tipo Amen simplificado.
  parsePattern('D..t..T.D...T.t.', 0.15, 0.11),
  // Variante con mas movimiento, bombo doble al final del compás
  parsePattern('D..T..t.D.D...T.', 0.15, 0.11),
  // Mas espaciado, caja de relleno entre los golpes fuertes
  parsePattern('D......T..t...T.', 0.16, 0.1),
  // Con adorno de entrada (dos taks pegados al arranque)
  parsePattern('DT..T...D...t.T.', 0.15, 0.09),
  // silencio -- un compás entero de respiro real, no todo constante
  parsePattern('................', 0, 0),
];


// Temas ambientales originales. Comparten el mismo motor de síntesis, pero
// cambian escala, tempo, fraseo, bajo, percusión y densidad de solista. Así el
// usuario puede elegir una melodía/ambiente sin depender de MP3 externos ni
// sumar peso al frontend.
export const AMBIENT_THEMES = {
  andalus: {
    id: 'andalus',
    label: 'Al-Ándalus',
    description: 'Oud, guitarra y saxo con color frigio.',
    scale: OUD_SCALE,
    keyCenters: KEY_CENTERS_SEMITONES,
    phrases: PHRASES,
    saxPhrases: SAX_PHRASES,
    padNotes: PAD_NOTES,
    bassPattern: BASS_PATTERN,
    percussionPatterns: PERCUSSION_PATTERNS,
    stepMs: STEP_MS,
    phraseNoteGapMs: PHRASE_NOTE_GAP_MS,
    pluckGapSteps: PLUCK_GAP_STEPS,
    pluckChance: PLUCK_CHANCE,
    saxNoteGapMs: SAX_NOTE_GAP_MS,
    saxGapSteps: SAX_GAP_STEPS,
    saxChance: SAX_CHANCE,
    instruments: ['oud', 'guitar'],
    keyChangeBars: 6,
  },
  // Al-Ándalus conserva el generador estocástico original. Los demás temas
  // se declaran una sola vez en el catálogo estructurado de abajo.

 };

// V11: Al-Ándalus conserva deliberadamente el motor original de arriba.
// El resto deja de ser una variación del mismo generador oud/guitarra/saxo:
// cada tema usa un secuenciador estructurado y una familia tímbrica propia.
// Son composiciones originales y deterministas por secciones; no MP3s, no
// samples externos y, sobre todo, no once clones con bigote postizo.
Object.assign(AMBIENT_THEMES, STRUCTURED_AMBIENT_THEMES);,36:'H',40:'S',44:'H',48:'K',52:'H',56:'S',60:'H'},
      },
    ],
  },
});

export const AMBIENT_GENRE_ORDER = ['SPA / Zen', 'Smooth Jazz', 'Tropical House', 'Energía', 'Ecléctica', 'Clásica', 'Lo-Fi / Chill', 'Trip-Hop / Downtempo', 'Bossa / Latin Lounge', 'Piano / Minimal', 'Dark Ambient', 'Jazz / Mediterráneo', 'Electrónica / Experimental', 'Ambient / Otros'];
const MEDITERRANEAN_IDS = new Set([
  'andalus','casablanca','velvet','alexandria241','cairo0047','beirut0113','damascusBlueHour','istanbul0326','tangierSmoke','bosphorusRain',
  'beirutRooftop0412','casablancaLastCall','cairoQuietHours','nileBalcony0152','aleppoAfterRain','ammanVelvetRoom','medinaBlueSmoke','cairoRedLantern',
  'beirutNightTaxi','tangierRedTable','istanbulBackgammon','andalusianCoast','granadaPatio','cadizLanterns','terraceFireflies','cafeFirelight','malagaLastTram','bishopBlues',
]);
const ELECTRONIC_IDS = new Set(['clockwork','electricDesert','storm','orbitalMonastery','metro317','glassAsh','analogBunker','nightFreight','machineRoom']);
export const CURATED_HIDDEN_THEME_IDS = new Set(['orbitalMonastery','metro317','glassAsh','machineRoom','abyssalArchive','redVault']);
const CLASSICAL_IDS = new Set(['gambit','cathedral','duel','lateEndgame','rigaRain','kingTango','zugzwangWaltz','winterLibrary','queenRequiem','endgameAdagio','knightFugue','nocturnalQuartet']);
function ambientGenre(theme) {
  if (theme.genre) return theme.genre;
  if (CLASSICAL_IDS.has(theme.id)) return 'Clásica';
  if (MEDITERRANEAN_IDS.has(theme.id)) return 'Jazz / Mediterráneo';
  if (ELECTRONIC_IDS.has(theme.id)) return 'Electrónica / Experimental';
  return 'Ambient / Otros';
}

export const AMBIENT_THEME_OPTIONS = Object.values(AMBIENT_THEMES)
  .filter(({ id }) => !CURATED_HIDDEN_THEME_IDS.has(id))
  .map(({ id, label, description, ...theme }) => ({
    id, label, description, genre: ambientGenre({ id, ...theme }),
  }));
export const AMBIENT_THEME_GROUPS = AMBIENT_GENRE_ORDER.map((genre) => ({
  genre,
  themes: AMBIENT_THEME_OPTIONS.filter((theme) => theme.genre === genre),
})).filter((group) => group.themes.length);
