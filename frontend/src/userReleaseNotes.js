import { APP_RELEASE } from './release.js';

export const USER_RELEASE_NOTES_KEY = 'chess-study-user-release-notes-seen';

// Changelog de producto: sólo cambios que el jugador ve, entiende o puede usar.
// Infraestructura, nombres internos, hashes y recuentos de tests se quedan fuera.
export const USER_RELEASE_NOTES = Object.freeze([
  {
    release: 'v16.6dm46z',
    title: 'Combat ya no te secuestra una batalla',
    highlights: [
      'Si el análisis de la CPU falla o devuelve una jugada inválida, Combat continúa con una jugada legal calculada localmente en vez de obligarte a abandonar y asumir bajas.',
      'La economía premia capturas, pocas bajas, capturas difíciles y mérito táctico, con límites anti-farming para que comprar equipo siga costando trabajo.',
      'Mercenarios y equipo separan mejor refuerzo temporal, bonus operativo y veteranía: llevar un arma ya no infla el nivel ni el rango visible de la unidad.',
      'Feedback permite adjuntar capturas PNG, JPG/JPEG o GIF para que un bug llegue al admin con contexto visual.',
    ],
  },
  {
    release: 'v16.6dm46y',
    title: 'Combat se siente más sólido y más táctico',
    highlights: [
      'El tablero mantiene las 64 casillas con una geometría uniforme y el chat acompaña la altura real de la mesa de juego.',
      'Los tres reyes finales tienen reglas más distintas y visibles, para que cada boss pida una forma diferente de rematar la operación.',
      'Mercenarios, mercado y elección de ruta explican mejor qué compras, qué arriesgas y qué ganas antes de comprometerte.',
      'El debrief prioriza lo ocurrido y la siguiente decisión, con una gramática visual más coherente entre Home, partidas y Combat.',
    ],
  },
  {
    release: 'v16.6dm46x',
    title: 'La campaña pisa terreno de verdad',
    highlights: [
      'El arte de la campaña gana presencia: la cartografía se ve claramente detrás de rutas y sectores sin ocultar la información útil.',
      'Las partidas de campaña cambian de terreno entre selva, distrito sitiado, desierto y ciudadela final.',
      'Cada terreno cambia el marco y las casillas manteniendo contraste alto para que piezas, jaques y movimientos sigan leyéndose de un vistazo.',
    ],
  },
  {
    release: 'v16.6dm46w',
    title: 'Partidas más claras y estadísticas más justas',
    highlights: [
      'Táctica, Precisión y Remate del desafío diario se pueden abrir directamente desde Home.',
      'Al terminar una partida aparece un resumen inmediato con resultado, rating, comentario de la CPU y las siguientes acciones útiles.',
      'Cancelar o abandonar sin penalización queda fuera de tus estadísticas y del diagnóstico de la CPU.',
      'La mesa de juego aprovecha mejor la altura disponible y mantiene los controles importantes a mano.',
    ],
  },
  {
    release: 'v16.6dm46v',
    title: 'Los reyes dejan de ser clones',
    highlights: [
      'La campaña elige entre tres bosses finales con retrato, HP, presión y regla propia: Rey de Hierro, Rey Nómada y Rey Sombra.',
      'Los sectores accesibles explican mejor el riesgo y la recompensa antes de comprometer la ruta.',
      'Los mercenarios llegan con especialidad y equipo incluido, para aportar valor táctico desde la primera batalla.',
      'Mercado y debrief distinguen mejor qué ocurrió, qué ganaste y qué conviene hacer después.',
    ],
  },
  {
    release: 'v16.6dm46t',
    title: 'Combat encaja mejor en cada pantalla',
    highlights: [
      'El tablero de Combat se adapta al espacio disponible y comparte altura con el registro táctico.',
      'En móvil el tablero tiene prioridad y los paneles secundarios bajan debajo.',
      'Una retirada conserva la operación para que puedas reorganizar y reintentar el mismo sector.',
    ],
  },
  {
    release: 'v16.6dm46s',
    title: 'La campaña gana presencia',
    highlights: [
      'Mercado queda visible durante la campaña y Reiniciar campaña permite empezar otra operación sin borrar tu ejército persistente.',
      'El mapa muestra la cartografía artística bajo los sectores y rutas reales de cada operación.',
      'Las guitarras y la familia Bossa se han reajustado para sonar más musicales y menos sintéticas.',
      'El desafío diario reúne sus tres objetivos, racha y progreso en una sola franja compacta.',
    ],
  },
  {
    release: 'v16.6dm46l',
    title: 'Tus errores entrenan de verdad',
    highlights: [
      'Puzzles personales pone tus errores reales en una cola clara y conserva los ya dominados en el histórico.',
      'Cuando falta material, pueden aparecer variantes nuevas basadas en tus errores y validadas por el motor antes de guardarse.',
    ],
  },
  {
    release: 'v16.6dm46c',
    title: 'Más personalidad dentro y fuera del tablero',
    highlights: [
      'Nuevos estilos de piezas y más identidad visual para personalizar el tablero.',
      'Combat incorpora mercado, mercenarios y despliegue con más decisiones antes de entrar en batalla.',
      'La radio recuerda tu selección y ofrece más estilos musicales.',
    ],
  },
]);

export function currentUserReleaseNotes(release = APP_RELEASE) {
  return USER_RELEASE_NOTES.find((entry) => entry.release === release) || USER_RELEASE_NOTES[0];
}
