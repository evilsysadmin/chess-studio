import { APP_RELEASE } from './release.js';

export const USER_RELEASE_NOTES_KEY = 'chess-study-user-release-notes-seen';

// Changelog de producto: sólo cambios que el jugador ve, entiende o puede usar.
// Infraestructura, nombres internos, hashes y recuentos de tests se quedan fuera.
export const USER_RELEASE_NOTES = Object.freeze([
  {
    release: 'v16.6dm46zfrh',
    title: 'Matthias deja de pasarse tres horas con el bocata',
    highlights: [
      'El rincón de Matthias rota ahora pequeñas escenas según la hora local: prensa, estudio, expedientes, partidas de ajedrez, café, una cervezota ocasional y, por fin, un almuerzo de duración humana.',
      'Las nuevas escenas conservan el mismo peón militar y sirven sólo como ambientación: no cambian reglas, estadísticas ni recomendaciones.',
      'La taza de café adopta la marca propia de Matthias: un peón cabreado reconocible, sin símbolos genéricos que puedan confundirse con otra cosa.',
      'El entorno de pruebas alinea también la auditoría de dependencias Python con el mismo virtualenv que instala el backend, evitando fallos de CI por herramientas de seguridad ausentes en el Python global.',
    ],
  },
  {
    release: 'v16.6dm46zfrg',
    title: 'La Escuela de Matthias ya es un curso de verdad',
    highlights: [
      'La Escuela se organiza en cinco cursos: Básico, Básico-medio, Medio, Medio-avanzado y Avanzado, con dificultad y objetivos cada vez más serios.',
      'Las lecciones avanzan desde movimientos elementales hasta secuencias de varias jugadas, desarrollo, tempos, clavadas, redes de mate, sacrificios y cálculo.',
      'Cada curso termina en un examen práctico sin pistas; aprobarlo desbloquea el siguiente nivel y suspender sólo significa volver a intentarlo con Matthias juzgando en silencio administrativo.',
      'La guía inicial empieza ahora por la Escuela y Home deja claro el curso actual, el progreso y que hay cinco niveles con examen.',
    ],
  },
  {
    release: 'v16.6dm46zfrf',
    title: 'La Escuela de Matthias abre el tablero',
    highlights: [
      'Escuela de Matthias convierte los fundamentos en ejercicios hands-on: eliges la pieza y haces la jugada directamente sobre el tablero en vez de tragarte una pared de texto.',
      'Matthias corrige movimientos equivocados con paciencia y mala leche, ofrece pistas cuando las pides y sólo desbloquea la siguiente lección cuando demuestras el movimiento correcto.',
      'El progreso de la Escuela queda guardado en tu perfil y el recorrido crítico comprueba que la primera lección sigue completada después de recargar la aplicación.',
      'La entrada de Aprendizaje pasa a llamarse Escuela de Matthias y explica claramente que allí se entrenan movimientos y reglas básicas sobre el tablero.',
    ],
  },
  {
    release: 'v16.6dm46zfre',
    title: 'El despacho de Matthias empieza a contar vuestra historia',
    highlights: [
      'El rincón de Matthias muestra pequeñas señales ganadas de verdad: retos vigentes, méritos, agravios archivados y respeto acumulado, sin niveles de amistad ni decoración inventada.',
      'La sesión actual aparece de forma discreta con partidas y resultados de esta pestaña; se reinicia al iniciar sesión para que nunca mezcle jugadores.',
      'El expediente de Así juegas ordena los hitos recientes como una pequeña cronología, separando méritos y agravios con sus fechas cuando existen.',
      'Así juegas da más presencia al retrato de Matthias sin robar espacio al diagnóstico, y mantiene completas sus escenas de café, bocata o guardia.',
    ],
  },
  {
    release: 'v16.6dm46zfrd',
    title: 'Matthias vuelve a ser un peón con mala leche',
    highlights: [
      'El retrato humano desaparece: Matthias vuelve a su identidad de peón militar y la mantiene en partida, Home, Así juegas y sus briefings.',
      'Su escena cambia con tu hora local: café por la mañana, bocata a mediodía, operación por la tarde, café nocturno y modo sobando de madrugada.',
      'Las consultas siguen reflejando su humor real con poses del mismo personaje; los accesorios son puntuales y Matthias no se convierte en una colección de avatares distintos.',
    ],
  },
  {
    release: 'v16.6dm46zfrc',
    title: 'Matthias deja ver el humor',
    highlights: [
      'El rincón de Matthias refleja con microseñales visuales el humor que ya calcula a partir de tu rendimiento real, sin convertirlo en un muñeco estridente.',
      'Su estado aparece con una etiqueta breve y el retrato cambia sólo de forma sutil cuando está contento, escéptico, cabreado o impresionado.',
      'Las señales respetan movimiento reducido y, si llega un estado desconocido, la interfaz vuelve de forma segura a Observador.',
    ],
  },
  {
    release: 'v16.6dm46zfrb',
    title: 'Matthias ya tiene humor medible',
    highlights: [
      'Matthias adapta su tono a un estado narrativo calculado sólo con rendimiento real: puede estar contento, satisfecho, escéptico, cabreado o impresionado sin inventar causas.',
      'El humor tiene inercia: una sola partida no lo convierte en una veleta, pero varias victorias, derrotas o sesiones de entrenamiento sí cambian cómo te habla.',
      'Administración muestra un resumen agregado del humor de Matthias, los tipos de consulta y cómo están respondiendo sus servicios, sin exponer prompts ni conversaciones privadas.',
    ],
  },
  {
    release: 'v16.6dm46zfq',
    title: 'F5 conserva el parte de batalla',
    highlights: [
      'El debrief de Combat Chess sobrevive a un F5 durante recompensa, briefing o piso superado, pero sigue siendo efímero y no cruza un login, logout ni el avance al siguiente encuentro.',
      'Los puzzles personales generados por Workers AI comparten ahora un contrato de calidad versionado: los ejercicios antiguos que no pueden demostrar los gates tácticos vigentes salen de la cola activa en vez de reaparecer por inercia.',
      'La continuidad crítica queda reforzada alrededor de re-login, onboarding revisitable, abandono sin penalización y recuperación de Combat sin inventar estados.',
    ],
  },
  {
    release: 'v16.6dm46zfp',
    title: 'Puzzles con defensa de verdad',
    highlights: [
      'El banco de puzzles endurece su auditoría: mates y combinaciones deben funcionar contra la mejor defensa, y los ejercicios de material dejan de aceptar respuestas rivales artificialmente cooperativas.',
      'Los puzzles generados desde errores personales pasan un segundo filtro contra sacrificios o jaques de humo que dejan la pieza capturable sin compensación táctica.',
      'El Final de la Ópera conserva su sacrificio correcto y ahora explica por qué el rey no puede capturar la torre final: el alfil de g5 protege d8. Matthias también saluda una vez tras cada login explícito y vuelve luego a su silencio habitual.',
    ],
  },
  {
    release: 'v16.6dm46zfo',
    title: 'Matthias te recibe al volver',
    highlights: [
      'Tras un login explícito, el rincón de Matthias muestra un saludo corto una sola vez y vuelve después a su silencio habitual.',
      'El saludo es independiente del cooldown de sus comentarios ocasionales, no se repite al refrescar la página y una cuenta nueva lo consume dentro de la presentación inicial para evitar duplicados.',
    ],
  },
  {
    release: 'v16.6dm46zfn',
    title: 'Matthias guía con tres puertas claras',
    highlights: [
      'La bienvenida de Matthias conserva su presentación, pero elimina el botón duplicado de acción: las tres tarjetas de la guía son ahora enlaces completos y clicables.',
      'Jugar una partida, resolver un puzzle y abrir Así juegas se pueden elegir directamente desde la tarjeta correspondiente, con foco de teclado, hover y una señal visual clara del siguiente paso.',
      'Ahora no sólo pospone la guía: mientras queden pasos aparece Retomar guía · X/3 en Home, y al abrirla continúa desde el progreso real sin obligarte a empezar de cero.',
    ],
  },
  {
    release: 'v16.6dm46zfm',
    title: 'Matthias encuentra su rincón',
    highlights: [
      'Home sustituye el avatar flotante de Matthias por un rincón integrado con bocadillo propio, justo antes de elegir la próxima partida.',
      'Cuando no tiene nada importante que decir, Matthias permanece en silencio con un simple “…”; cuando habla, usa el mismo espacio para mostrar el comentario real, su contexto y una única acción útil.',
      'Tocar el bocadillo o el avatar abre Así juegas, mientras el diseño se adapta a móvil sin competir con la guía, una partida pendiente u otras prioridades de Home.',
    ],
  },
  {
    release: 'v16.6dm46zfl',
    title: 'Las actualizaciones esperan su turno',
    highlights: [
      'Si aparece una versión nueva mientras una partida está activa, Chess Studio conserva el tablero y deja la actualización para un momento seguro en lugar de interrumpir la sesión.',
      'La detección de nuevas versiones vuelve a comprobar una publicación que llegue justo durante otra comprobación, evitando que una carrera del navegador retrase el aviso varios minutos.',
    ],
  },
  {
    release: 'v16.6dm46zfk',
    title: 'Matthias empieza a guardar rencor con fundamento',
    highlights: [
      'Matthias gana respeto sólo cuando lo justifican tus resultados, mantiene una obsesión de entrenamiento y puede proponerte retos persistentes que no da por cerrados hasta ver partidas limpias de verdad.',
      'Reencuentros tras una ausencia, asuntos pendientes, hitos de relación, posiciones emblemáticas y silencios deliberados hacen que recuerde la historia compartida sin inventarse recuerdos ni repetir la misma pulla cada cinco minutos.',
      'La tarjeta del rival muestra el historial de vuestro duelo y Administración incorpora un banco de personalidad con perfiles sintéticos para probar la voz de Matthias sin tocar memoria, estadísticas ni cuota de jugadores reales.',
    ],
  },
  {
    release: 'v16.6dm46zfj',
    title: 'Matthias ya lleva expediente',
    highlights: [
      'Matthias mantiene objetivos de entrenamiento, aperturas-némesis, hitos de Hall of Fame/Shame y una relación que evoluciona sólo con datos reales de tus partidas.',
      'Partida rápida incorpora un briefing persistente sin gastar una llamada de IA, y la autopsia/replay permiten preguntarle por una posición concreta usando FEN y evaluación real como ancla.',
      'Administración gana un inspector acotado de la memoria de Matthias; en Home habla menos por banalidades cuanto más veterano eres, pero conserva prioridad para objetivos e hitos que sí importan.',
    ],
  },
  {
    release: 'v16.6dm46zfi',
    title: 'Matthias aprende sin inventarse tu vida',
    highlights: [
      'La memoria de Matthias pasa a schema versionado y acotado: recuerda consultas y consejos recientes, pero la mejora o reincidencia sólo se deriva de estadísticas reales calculadas por Chess Studio.',
      'Los reintentos usan un identificador idempotente para no duplicar consejos ni gastar Workers AI dos veces; Admin mantiene consultas sin cooldown y gana métricas de uso, fallback, latencia y timeouts.',
      'Empezar de cero borra también el expediente de Matthias, mientras Administración puede hacer que olvide sólo a un jugador sin tocar sus partidas, rating ni progreso.',
    ],
  },
  {
    release: 'v16.6dm46zfh',
    title: 'Matthias empieza a recordar',
    highlights: [
      'Matthias conserva una memoria estructurada y acotada de tus consultas y progreso para no empezar de cero cada vez y poder ajustar sus consejos a lo que realmente mejora o se repite.',
      'Su avatar queda disponible en Home de forma discreta y, cuando tiene algo que decir, abre la boca sin invadir la pantalla; tocarlo lleva directamente a Así juegas.',
      'Administración incorpora el estado de Matthias con consultas recordadas, jugadores atendidos, tema más frecuente y consejo reciente, mientras su identidad y personalidad quedan fijadas también en Workers AI.',
    ],
  },
  {
    release: 'v16.6dm46zfg',
    title: 'Salir significa salir',
    highlights: [
      'Cerrar sesión retira tu presencia inmediatamente mientras se guarda el perfil; si el guardado falla y sigues dentro, Chess Studio te vuelve a anunciar online sin esperar al siguiente heartbeat.',
      'Los permisos de administrador se recuperan solos si la comprobación de cuenta falla de forma transitoria, sin bloquear al jugador ni exigir recargar la página.',
      'Mi cuenta deja de quedarse cargando eternamente cuando el backend no responde, y los indicadores administrativos conservan el último dato confirmado durante una caída breve.',
    ],
  },
  {
    release: 'v16.6dm46zff',
    title: 'Cada pestaña, la suya',
    highlights: [
      'Una pestaña abierta desde otra ya no puede heredar por accidente su identidad de presencia: cada tablero mantiene su propia sesión aunque el navegador copie sessionStorage.',
      'Administración deja de fingir que una ventana antigua sigue en segundo plano cuando esa señal ya ha caducado; presencia y visibilidad vuelven a decir exactamente lo que sabemos.',
      'La comprobación de nuevas versiones se pausa mientras la pestaña está oculta y se retoma al volver, sin consultas inútiles en segundo plano.',
    ],
  },
  {
    release: 'v16.6dm46zfe',
    title: 'Deploy sin patadas en el tablero',
    highlights: [
      'Si aparece una versión nueva mientras juegas, Chess Studio la aplaza y conserva la partida; un refresh de actualización vuelve al tablero y a la posición confirmada.',
      'La presencia queda cubierta también entre navegadores independientes: cerrar sesión en uno no expulsa por error al mismo usuario que sigue jugando en otro.',
      'Administración verifica visualmente primer plano, segundo plano, inactividad y offline, y el entrenamiento personal conserva estadísticas sin duplicar intentos o puzzles.',
    ],
  },
  {
    release: 'v16.6dm46zfd',
    title: 'F5 sin fantasmas',
    highlights: [
      'Cada pestaña lleva su propia presencia y, al recargar o cerrar, Chess Studio retira la identidad vieja antes de anunciar la nueva para evitar usuarios fantasma o F5 que te apaguen por error.',
      'Los puzzles personales ya dominados no vuelven al pulsar Siguiente: salen de la cola normal y quedan disponibles únicamente en el histórico para revisarlos cuando tú quieras.',
      'La recuperación de partida, torneo, series, puzzles, desafío diario y Combat conserva el contexto al recargar, sin convertir un refresh en abandono.',
    ],
  },
  {
    release: 'v16.6dm46zfc',
    title: 'Presencia sin fantasmas',
    highlights: [
      'Cerrar sesión apaga de inmediato ese navegador sin marcarte offline por error si sigues conectado desde otro dispositivo.',
      'Administración refresca presencia cada 30 segundos sólo cuando está visible, actualiza al volver a la pestaña y distingue correctamente online de segundo plano.',
      'Retro Player avisa si el navegador mantiene Web Audio suspendido tras un refresh y ofrece reanudarlo con un toque.',
    ],
  },
  {
    release: 'v16.6dm46zfb',
    title: 'Matthias recibe a los reclutas',
    highlights: [
      'Matthias se presenta dentro de la propia guía inicial y la lidera, en vez de competir con ella por el espacio de Home.',
      'Cerrar sesión te quita de la presencia online de inmediato y Administración actualiza automáticamente quién sigue conectado cada 30 segundos.',
      'Abandonar antes de haber perdido una pieza cancela sin penalización, y Retro Player recupera el audio al primer gesto tras un refresh si el navegador dejó Web Audio suspendido.',
    ],
  },
  {
    release: 'v16.6dm46zez',
    title: 'Matthias abre despacho',
    highlights: [
      'Matthias se presenta una sola vez a quienes todavía no lo conocen y conserva después sus apariciones ocasionales sin convertirse en un pesado.',
      'Así juegas estrena una audiencia diaria guiada con Matthias: eliges qué quieres mejorar y recibes un único consejo diario basado en tu juego real.',
      'La radio suma cinco escenas nuevas, desde jazz nocturno y piano con lluvia hasta oud táctico y una marcha con bastante aroma a Matthias.',
    ],
  },
  {
    release: 'v16.6dm46zex',
    title: 'El tablero vuelve a hablar con el backend',
    highlights: [
      'Corrige una regresión del navegador que podía bloquear crear, mover o deshacer una partida antes de que la petición llegara al servidor.',
      'La mesa de controles pasa a formar parte del mismo bloque que rival, tablero y jugador para mantenerse alineada con el ancho real del tablero.',
      'Administración permite crear un feedback de prueba real y borrarlo desde la misma bandeja para comprobar el circuito completo.',
    ],
  },
  {
    release: 'v16.6dm46zew',
    title: 'La mesa de juego respira mejor',
    highlights: [
      'La barra inferior de partida se reduce a lo importante: estado, Zen, abandonar y las acciones que realmente uses durante la partida.',
      'Opciones avanzadas desaparece de la mesa de juego para recuperar espacio vertical y mantener todos los controles alineados.',
      'En portátiles el tablero aprovecha mejor la altura disponible sin empujar la zona de acciones fuera de la pantalla.',
    ],
  },
  {
    release: 'v16.6dm46zev',
    title: 'Matthias firma el veredicto',
    highlights: [
      'Así te ve la CPU incorpora a Matthias como analista residente: su retrato acompaña el diagnóstico y deja claro quién firma la pulla y el consejo.',
      'Corrige una regresión que podía impedir iniciar una partida nueva en determinadas rutas de creación.',
      'Un fallo previo ya no arrastra las siguientes peticiones y deja análisis o consejos temporalmente fuera de servicio durante la misma sesión.',
    ],
  },
  {
    release: 'v16.6dm46zeu',
    title: 'Matthias entra en escena',
    highlights: [
      'La CPU tiene una identidad visible: Matthias aparece en la tarjeta del rival y firma sus comentarios en el chat sin ocupar espacio extra del tablero.',
      'De vez en cuando Matthias se asoma a Home con una invitación breve; si recuerda una cagada concreta, sale únicamente de incidentes reales guardados en tu historial.',
      'Actividad reciente muestra el nivel de CPU de cada partida cuando está disponible, y los objetivos guardados por versiones antiguas se presentan ya como Retos.',
    ],
  },
  {
    release: 'v16.6dm46zet',
    title: 'Tus errores se entrenan como un replay',
    highlights: [
      'Entrena tus errores coloca el tablero y la explicación lado a lado: el panel de coach reúne contexto, jugada realizada, mejor jugada, línea recomendada e histórico sin empujar el análisis debajo del tablero.',
      'Los administradores ven un sobre discreto en Home cuando hay feedback nuevo y pueden saltar directamente a la bandeja.',
      'El feedback resuelto mantiene visibles Reabrir y Borrar feedback para poder limpiar mensajes de prueba sin rebuscar.',
    ],
  },
  {
    release: 'v16.6dm46zes',
    title: 'Hotfix de estabilidad del despliegue',
    highlights: [
      'Una comprobación interna de estabilidad deja de bloquear actualizaciones correctas en instalaciones locales.',
    ],
  },
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
      'La barra inferior de partida separa estado y acciones y alinea Zen/Abandonar dentro de una misma familia visual.',
      'Combat Chess recupera la cartografía artística con nodos dentro de márgenes seguros, y Administración permite borrar feedback de prueba.',
      'El footer centra y espacia sus enlaces para que FAQ, atajos, privacidad y Acerca de queden más fáciles de localizar.',
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
