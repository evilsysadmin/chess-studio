import { APP_RELEASE } from './release.js';

export const USER_RELEASE_NOTES_KEY = 'chess-study-user-release-notes-seen';

// Changelog de producto: sólo cambios que el jugador ve, entiende o puede usar.
// Infraestructura, nombres internos, hashes y recuentos de tests se quedan fuera.
export const USER_RELEASE_NOTES = Object.freeze([
  {
    release: 'v16.6dm46zer',
    title: 'Las partidas aguantan mejor los golpes',
    highlights: [
      'Reintentar una creación o jugada tras un fallo de red ya no puede duplicar la operación si el servidor llegó a guardarla antes de perder la respuesta.',
      'Partidas, series, puzzles y Combat tienen transiciones de estado más estrictas para evitar pantallas atrapadas o recuperaciones contradictorias.',
      'La recuperación de partidas y campañas conserva una única fuente de verdad y trata errores temporales, saves antiguos y estados incompletos de forma explícita.',
    ],
  },
  {
    release: 'v16.6dm46zeq',
    title: 'Retos claros, mapa firme y controles en formación',
    highlights: [
      'Los objetivos opcionales de partida pasan a llamarse Retos y se explican en el onboarding y la FAQ; el pronóstico también adopta una etiqueta natural.',
      'La barra inferior de partida separa estado y acciones, alinea Zen/Abandonar y convierte Opciones avanzadas en una pieza integrada en vez de un control huérfano.',
      'Combat Chess recupera la cartografía artística con nodos dentro de márgenes seguros, y Administración permite borrar feedback de prueba.',
      'El footer centra y espacia sus enlaces, y el diagnóstico OTLP normaliza los endpoints por señal para que Tempo no dependa de una URL ambigua.',
    ],
  },
  {
    release: 'v16.6dm46zep',
    title: 'La primera partida ya tiene guía de verdad',
    highlights: [
      'El onboarding marca dentro de la propia Home el siguiente paso real: primero rival, después puzzle y finalmente Así juegas, sin overlays que bloqueen la pantalla.',
      'Seguir un paso ya no descarta la guía. Sólo Ahora no, cerrar o terminar el recorrido la apartan; al volver a Home continúa desde el progreso realmente conseguido.',
      'Si existe una partida activa, el recorrido prioriza Continuar partida en vez de intentar abrir otra, y el aviso de inactividad se calla mientras hay una guía o panel de ayuda abierto.',
      'Zen y Abandonar partida comparten la misma familia visual; el peligro se expresa con un acento discreto en lugar de una pastilla roja ajena al resto del tablero.',
      'Los fallos al crear Partida rápida o Rival Fantasma conservan el modal y su configuración para reintentar, y entrar a puzzles personales sin material explica claramente el fallback a un ejercicio clásico.',
    ],
  },
  {
    release: 'v16.6dm46zeo',
    title: 'La voz del usuario sube; los detalles bajan',
    highlights: [
      'Administración muestra el feedback de usuarios junto al estado del servicio, antes de la tabla de usuarios, para que los avisos importantes no queden enterrados.',
      'La Home incorpora al final enlaces discretos a FAQ, atajos, privacidad y datos, y Acerca de Chess Studio; sólo despliegan contenido cuando lo pides.',
      'Privacidad aclara qué datos de juego y operación se usan y deja explícito que la presencia no rastrea clics, ratón ni teclado.',
    ],
  },
  {
    release: 'v16.6dm46zen',
    title: 'La mesa vuelve a caber entera',
    highlights: [
      'Las partidas de escritorio reservan espacio real para rival, tablero, jugador y acciones, evitando que la parte inferior quede fuera de pantalla en portátiles y monitores de 900 px de alto.',
      'La botonera de partida vuelve a formar una sola barra coherente: misma altura y escala, con Zen como acción secundaria y abandonar distinguido sin convertirse en un botón estridente.',
      'Combat Chess aplica la misma disciplina de viewport y acciones; las ventanas mantienen sus controles accesibles aunque el contenido crezca.',
    ],
  },
  {
    release: 'v16.6dm46zem',
    title: 'Más club de ajedrez, menos dashboard',
    highlights: [
      'La Home rebaja el aspecto de panel corporativo y refuerza una dirección de club de ajedrez nocturno con tacto de videojuego táctico.',
      'Desafío diario y recomendación pasan a segundo plano visual para que Torneo, Combat Chess y Partida rápida vuelvan a ser el centro de la pantalla.',
      'Las tarjetas principales ganan atmósfera e imagen, con menos cajas, bordes e iconos tipo aplicación; cabecera y acciones secundarias también reducen ruido.',
    ],
  },
  {
    release: 'v16.6dm46zel',
    title: 'Combat liquida bien y los puzzles dejan de hacer trampas',
    highlights: [
      'Combat Chess conserva el nivel real del encuentro al cerrar una batalla, así la recompensa de créditos y el debrief ya no pueden romperse al terminar.',
      'Los puzzles curados retiran cuatro trampas históricas que dependían de que el rival aceptase voluntariamente una mala defensa; una combinación activa debe sobrevivir a defensa óptima.',
      'La recuperación tras un 503 sigue pudiendo reintentarse manualmente y su prueba ya no compite con la reconciliación automática de la propia app.',
    ],
  },
  {
    release: 'v16.6dm46zek',
    title: 'Los fallos técnicos ya no inventan derrotas',
    highlights: [
      'La Torre y la campaña vuelven a un punto jugable si desaparece una batalla guardada, conservando el progreso real sin fabricar bajas ni derrotas.',
      'Salir del torneo con negras antes de tu primer movimiento ya no convierte la apertura automática de la CPU en una rendición.',
      'Una partida dañada puede descartarse sin derrota, y Combat libre avisa claramente cuando una batalla anterior no se pudo reconstruir.',
      'Las pantallas de recuperación sólo aparecen cuando existe una sesión real que recuperar.',
    ],
  },
  {
    release: 'v16.6dm46zej',
    title: 'La campaña interrumpida vuelve al frente',
    highlights: [
      'Si desaparece la sesión temporal de una batalla, Combat vuelve al briefing del mismo sector en vez de obligarte a perder toda la campaña.',
      'Una operación que ya quedó archivada como interrumpida puede recuperarse con su ruta, suministros, reliquias y progreso disponibles.',
      'La recuperación conserva el ejército y las bajas realmente guardadas, sin inventar pérdidas ni marcar como ganado el combate pendiente.',
    ],
  },
  {
    release: 'v16.6dm46zei',
    title: 'Jugadas más sólidas y partidas que se recuperan',
    highlights: [
      'Las partidas normales comprueban cada respuesta antes de mostrarla y recuperan el estado correcto si una jugada se guardó pero la conexión falló al responder.',
      'La CPU siempre confirma que su propuesta es legal y, si su análisis falla, continúa con una alternativa válida en vez de dejar el turno bloqueado.',
      'Combat valida tablero y unidades como un único estado antes de aplicar una jugada, evitando bajas, experiencia o estadísticas parciales ante una posición imposible.',
      'Corrige el puzzle de la torre en la columna g: la solución gana material de verdad y el rey rival ya no puede capturar gratis la pieza clave.',
    ],
  },
  {
    release: 'v16.6dm46zeh',
    title: 'Más claro, más consistente y menos trampas raras',
    highlights: [
      'Home, formularios, modales, partidas, Combat y administración comparten una jerarquía visual más limpia y controles más consistentes.',
      'Feedback empieza en General y estrena un selector de capturas más cómodo, con previsualización y eliminación antes de enviar.',
      'Los controles multimedia siguen manejando Retro Player al entrar en una partida, aunque el reproductor visual cambie de sitio.',
      'Los puzzles refuerzan su control táctico: una solución no vale sólo por ser legal o dar jaque; los ejercicios personales nuevos deben coincidir con la mejor jugada validada antes de entrar en tu entrenamiento.',
    ],
  },
  {
    release: 'v16.6dm46zeg',
    title: 'Más estabilidad sin cambiarte la partida',
    highlights: [
      'Combat conserva una batalla recuperable aunque el almacenamiento temporal de la pestaña quede dañado.',
      'Cerrar Feedback cancela correctamente un envío en curso sin dejar la pantalla esperando.',
      'Las comprobaciones de reglas siguen siendo exhaustivas sin hacer que una actualización se eternice.',
    ],
  },
  {
    release: 'v16.6dm46zef',
    title: 'El inicio de sesión vuelve a hablar claro',
    highlights: [
      'Cancelar un inicio de sesión cancela también la petición en curso sin dejar una operación colgada.',
      'Una contraseña incorrecta vuelve a mostrar el error correcto en vez de confundirse con una sesión caducada.',
      'Las protecciones contra peticiones eternas se mantienen sin alterar el comportamiento normal del acceso.',
    ],
  },
  {
    release: 'v16.6dm46ze',
    title: 'Más ajedrez, menos pantallas tiesas',
    highlights: [
      'Partida rápida, Torneo, Práctica, Laboratorio, Rival Fantasma, Puzzles, Combat, Espectador y tablero 3D refuerzan sus comprobaciones de jaque, mate y movimientos legales.',
      'Las respuestas tardías, dobles pulsaciones y turnos diferidos se aíslan mejor para que una acción vieja no pueda bloquear o alterar la partida actual.',
      'Una partida guardada dañada o una posición imposible se detiene de forma segura en vez de tirar la pantalla o inventar una continuación.',
      'Feedback, inicio de sesión, copias de seguridad y pantallas de estado evitan operaciones duplicadas mientras una petición sigue en curso.',
    ],
  },
  {
    release: 'v16.6dm46zd',
    title: 'Más difícil dejar Chess Studio tieso',
    highlights: [
      'Las peticiones que se quedan colgadas tienen límite de tiempo y Combat protege mejor los turnos diferidos para no dejar el tablero bloqueado.',
      'Las batallas guardadas descartan posiciones corruptas antes de restaurarlas en vez de tirar la pantalla completa.',
      'Feedback permite al admin responderte directamente; las respuestas aparecen en el propio formulario, incluido un RESUELTO cuando toque.',
      'El entrenamiento personal conserva las protecciones contra ejercicios imposibles y bloqueos de interacción.',
    ],
  },
  {
    release: 'v16.6dm46zb',
    title: 'El servicio arranca con normalidad',
    highlights: [
      'Corrige una regresión de la última actualización que podía impedir que el servicio terminara de arrancar.',
      'Las partidas, perfiles y progreso guardado no cambian: es una corrección de estabilidad del servicio.',
      'Se añade una comprobación temprana para detectar esta clase de incompatibilidad antes de publicar otra versión.',
    ],
  },
  {
    release: 'v16.6dm46za',
    title: 'Feedback deja de hacer el cafre',
    highlights: [
      'Abrir Feedback ya no depende de cargar una pieza aparte de la interfaz, así que no puede tumbar la pantalla de forma intermitente.',
      'La pantalla conserva su sitio y muestra los errores de envío dentro del propio formulario, sin desmontar la navegación.',
      'Las mejoras de diagnóstico interno ayudan a seguir incidencias sin cambiar nada del juego.',
    ],
  },
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
