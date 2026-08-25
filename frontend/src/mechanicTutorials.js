import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

const MECHANIC_TUTORIAL_KEY = 'chess-study-mechanic-tutorial-progress-v1';

export const MECHANIC_TUTORIALS = Object.freeze([
  {
    id: 'combat-basics',
    group: 'Combat Chess',
    title: 'Combat Chess: qué cambia',
    summary: 'Capturas probabilísticas, XP persistente, bajas y amenaza.',
    steps: [
      { title: 'Las capturas pueden fallar', text: 'Antes de una captura ves el porcentaje de acierto. Si falla, el defensor esquiva y el atacante pierde el turno.' },
      { title: 'Tus unidades recuerdan', text: 'Alias, XP, rango, técnicas, medallas y bajas pertenecen a la identidad persistente de cada unidad.' },
      { title: 'Romper reglas cuesta', text: 'Veteranía, técnicas y metamorfosis de las unidades desplegadas pueden aumentar la dificultad de la CPU. Las reservas no cuentan.' },
      { title: 'Las bajas importan', text: 'Una unidad caída tiene una ventana de revive antes de la siguiente batalla. Si la dejas atrás, su identidad pasa al Memorial y llega un recluta nuevo.' },
    ],
  },
  {
    id: 'combat-deployment',
    group: 'Combat Chess',
    title: 'Prepara tu formación',
    summary: 'Puedes jugar con una formación recomendada en un clic o abrir la Mesa de Guerra si quieres decidir cada unidad.',
    steps: [
      { title: 'Jugar es el camino corto', text: 'Si no hay bajas pendientes, el botón principal usa tu formación actual o completa los huecos con defaults sensatos. Personalizar es opcional.' },
      { title: 'El tablero es la mesa de guerra', text: 'Arrastra una unidad o selecciónala y toca una casilla válida. Los 16 puestos representan los slots reales que entrarán al combate.' },
      { title: 'El tipo de origen manda', text: 'Cada puesto acepta un único tipo de origen. Un peón metamorfoseado sigue siendo peón y ocupa un slot de peón.' },
      { title: 'Reserva significa reserva', text: 'Quien no está en el tablero no participa, no aumenta amenaza y no puede morir ni ganar mérito en esa batalla.' },
      { title: 'Auto-fill y escuadras', text: 'Puedes llenar la formación priorizando veteranos o reclutas, ajustarla a mano y guardar hasta tres presets de escuadra con identidades y formas de despliegue.' },
    ],
  },
  {
    id: 'combat-metamorphosis',
    group: 'Combat Chess',
    title: 'Metamorfosis de veteranos',
    summary: 'Una identidad puede combatir con otra forma sin dejar de ser quien era.',
    steps: [
      { title: 'No cambia la identidad', text: 'El peón sigue siendo peón en su expediente aunque elijas que se mueva como caballo, alfil o torre durante una batalla.' },
      { title: 'Se desbloquea por servicio real', text: 'Las formas avanzadas exigen rango y condiciones de historial; no basta con acumular nivel.' },
      { title: 'Se elige antes del combate', text: 'La forma de despliegue queda fijada al comenzar la batalla. No puedes mutar libremente a mitad de la pelea.' },
    ],
  },
  {
    id: 'combat-campaign',
    group: 'Combat Chess',
    title: 'Tu campaña de Combat Chess',
    summary: 'Elige una ruta, prepara tu ejército y sobrevive sector a sector hasta el boss. Tus veteranos y reservas continúan entre batallas.',
    steps: [
      { title: 'Lee el mapa completo', text: 'La operación muestra los siete sectores, sus tres carriles y todas las bifurcaciones. La línea dorada marca tu ruta recorrida y las conexiones activas enseñan únicamente los destinos accesibles.' },
      { title: 'Elige la ruta', text: 'Combates, élites, eventos y campamentos se ven de antemano. Cualquier regla que cambie el material inicial se anuncia siempre antes de combatir; la intel compra precisión, no evita sorpresas.' },
      { title: 'El barracón persiste', text: 'Los veteranos, reservas, rangos y bajas sobreviven a la campaña. Las ventajas de campaña son temporales.' },
      { title: 'Las élites pagan mejor', text: 'Una victoria élite entrega más créditos operativos, mejores recompensas y puede ampliar el barracón con un refuerzo.' },
      { title: 'Reliquias operativas', text: 'Algunos eventos y élites dejan equipo estratégico que abarata intel, mejora créditos o reduce ruido. Dura sólo durante esa operación y no cambia cómo se mueve ninguna pieza.' },
      { title: 'El Rey Viejo rompe el final estándar', text: 'El boss usa HP. Los detalles exactos aparecen en su dossier cuando compras suficiente inteligencia.' },
    ],
  },
  {
    id: 'combat-intelligence',
    group: 'Combat Chess',
    title: 'Créditos e inteligencia',
    summary: 'Gasta recursos para conocer amenazas antes de arriesgar veteranos.',
    steps: [
      { title: 'Los créditos se ganan combatiendo', text: 'Las victorias de campaña generan créditos operativos. Las élites y el boss pagan más; repetir un estado ya resuelto no duplica la recompensa.' },
      { title: 'La intel tiene niveles', text: 'Siempre recibes una estimación básica del nivel rival. Contacto estrecha el rango; Evaluación revela la dificultad y nivel exactos; Dossier descubre detalles especiales del enemigo y del boss. Las reglas visibles del tablero son públicas desde el briefing.' },
      { title: 'La información es real', text: 'El briefing se deriva del nodo y sus reglas. Nunca inventa debilidades ni revela la jugada concreta que hará el motor.' },
      { title: 'Intel o reservas', text: 'El objetivo es decidir qué veteranos arriesgar y qué fuerza desplegar, no comprar una victoria automática.' },
    ],
  },
  {
    id: 'tournament',
    group: 'Competición',
    title: 'Torneo y progresión',
    summary: 'Puntos de torneo, niveles y recompensas separadas del ELO.',
    steps: [
      { title: 'Torneo no es partida rápida', text: 'La progresión del torneo sigue sus propios puntos y niveles. El ELO del jugador se calcula por separado.' },
      { title: 'La recompensa depende del resultado', text: 'El progreso se concede por resultados reales y puede variar con la dificultad y el rendimiento según las reglas activas.' },
      { title: 'Las pistas usan otra cartera', text: 'Las capturas pueden alimentar recursos de pista sin inflar artificialmente tu rating.' },
    ],
  },
  {
    id: 'quick-match-rules',
    group: 'Partida rápida',
    title: 'Partida rápida, sin menús de cabina',
    summary: 'Elige nivel y juega; color, reloj, series y reglas especiales quedan recogidos en Ajustes.',
    steps: [
      { title: 'Lo único obligatorio es el nivel', text: 'El control grande de dificultad es la decisión principal. Si no quieres tocar nada más, pulsa Empezar partida y listo.' },
      { title: 'Ajustes es opcional', text: 'Abre Ajustes sólo si quieres elegir color, reloj o una serie Best-of-3/Best-of-5. El resumen de la propia fila te dice qué está seleccionado.' },
      { title: 'Las rarezas están un nivel más abajo', text: 'Sudden Death y Control táctico viven dentro de Reglas especiales. Permanecen cerradas por defecto para que una partida normal no parezca el panel de un reactor.' },
    ],
  },
  {
    id: 'practice',
    group: 'Entrenamiento',
    title: 'Partida de práctica',
    summary: 'Juega contra la CPU con ayudas del motor y sin presión competitiva.',
    steps: [
      { title: 'Practica sin castigo competitivo', text: 'La partida conserva las reglas normales de ajedrez, pero está pensada para probar ideas y usar ayudas sin convertir cada error en una cuestión de rating.' },
      { title: 'Las pistas son una herramienta', text: 'Puedes consultar ayudas del motor para entender posiciones y alternativas. Úsalas para aprender qué cambia una posición, no sólo para copiar una jugada.' },
    ],
  },
  {
    id: 'openings',
    group: 'Entrenamiento',
    title: 'Aperturas famosas',
    summary: 'Recorre líneas clásicas jugada a jugada y entiende la idea de cada movimiento.',
    steps: [
      { title: 'Aprende la secuencia y la idea', text: 'Cada apertura se practica paso a paso. El objetivo no es memorizar coordenadas sin contexto, sino reconocer el plan que justifica cada jugada.' },
      { title: 'Repite sin penalización', text: 'Si fallas una jugada puedes reintentar la línea. Este modo es entrenamiento y no modifica tu ELO ni simula una partida competitiva completa.' },
    ],
  },
  {
    id: 'puzzles',
    group: 'Entrenamiento',
    title: 'Puzzles y desafío diario',
    summary: 'Posiciones de entrenamiento, rachas y problemas personales.',
    steps: [
      { title: 'No es una partida completa', text: 'Cada puzzle parte de una posición concreta y tiene una secuencia objetivo. La meta es encontrar la continuación correcta.' },
      { title: 'El desafío diario es único', text: 'El Daily Challenge mantiene su propio estado y racha. Resolverlo no modifica una partida normal.' },
      { title: 'Tus errores pueden volver', text: 'Las autopsias pueden generar posiciones personales basadas en incidentes reales de tus partidas.' },
    ],
  },
  {
    id: 'rival-ghost',
    group: 'Entrenamiento',
    title: 'Rival Fantasma',
    summary: 'CPU calibrada con tendencias reales de tu juego.',
    steps: [
      { title: 'No copia partidas', text: 'El fantasma usa tendencias medidas de tu historial para calibrar dificultad y estilo; no reproduce mágicamente tus movimientos.' },
      { title: 'Solo usa datos existentes', text: 'Si una debilidad no está medida, el modo no debe inventarla.' },
    ],
  },
  {
    id: 'insights',
    group: 'Entrenamiento',
    title: 'Así juegas',
    summary: 'Diagnóstico basado únicamente en estadísticas e incidentes registrados.',
    steps: [
      { title: 'Lee tendencias, no adivina', text: 'La sección resume errores, aperturas, color, puzzles y rating únicamente cuando hay datos reales suficientes.' },
      { title: 'Convierte datos en práctica', text: 'Cuando detecta un patrón repetido puede proponerte entrenamiento o posiciones críticas relacionadas.' },
    ],
  },
  {
    id: 'lab',
    group: 'Herramientas',
    title: 'Laboratorio libre',
    summary: 'Monta posiciones o pega FEN sin afectar tu ELO.',
    steps: [
      { title: 'Edita la posición', text: 'Puedes colocar piezas manualmente o cargar un FEN. El laboratorio no presupone una partida jugada desde la posición inicial.' },
      { title: 'Es un entorno de prueba', text: 'Jugar desde el laboratorio sirve para experimentar y no debe contaminar tu rating competitivo.' },
    ],
  },
  {
    id: 'spectator',
    group: 'Herramientas',
    title: 'Modo espectador',
    summary: 'CPU contra CPU sin que tú muevas piezas.',
    steps: [
      { title: 'Tú no juegas', text: 'Elige la fuerza de cada bando y observa la partida. Sirve para estudiar cómo se desarrollan posiciones y estilos.' },
      { title: 'No cuenta como partida propia', text: 'Los resultados de una partida observada no deben confundirse con tu rendimiento personal.' },
    ],
  },
]);

export function mechanicTutorialById(id) {
  return MECHANIC_TUTORIALS.find((tutorial) => tutorial.id === id) || null;
}

export function loadMechanicTutorialProgress() {
  try {
    const raw = JSON.parse(getStorageItem(STORAGE_LOCAL, MECHANIC_TUTORIAL_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function markMechanicTutorialSeen(id) {
  if (!mechanicTutorialById(id)) return loadMechanicTutorialProgress();
  const current = loadMechanicTutorialProgress();
  const next = { ...current, [id]: { seen: true, completedAt: new Date().toISOString() } };
  setProfileStorageItem(MECHANIC_TUTORIAL_KEY, JSON.stringify(next));
  return next;
}
