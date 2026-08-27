import { APP_RELEASE } from './release.js';

export const USER_RELEASE_NOTES_KEY = 'chess-study-user-release-notes-seen';

// Changelog de producto: sólo cambios que el jugador ve, entiende o puede usar.
// Infraestructura, nombres internos, hashes y recuentos de tests se quedan fuera.
export const USER_RELEASE_NOTES = Object.freeze([
  {
    release: 'v16.6dm46n',
    title: 'Combat recupera mejor y Novedades deja de estorbar',
    highlights: [
      'Novedades vive ahora justo debajo de Mi cuenta y puede abrirse desde cualquier pantalla sin ocupar la cabecera de Home.',
      'Combat Chess conserva la bitácora táctica y la preferencia de auto-level al recargar una batalla viva.',
      'Si la CPU no puede completar su turno por un fallo temporal, aparece un reintento explícito en vez de dejar la batalla bloqueada.',
      'Una campaña suspendida y una batalla libre ya no se pisan entre sí al compartir sessionStorage.',
    ],
  },
  {
    release: 'v16.6dm46m',
    title: 'El contador online deja de comerse jugadores',
    highlights: [
      'Usuarios online usa la misma presencia reciente que Administración: una pestaña en segundo plano ya no hace desaparecer a alguien conectado.',
      'Las cuentas admin siguen fuera del contador público, pero sin restas ciegas que podían mostrar 0 cuando había otro jugador real conectado.',
    ],
  },
  {
    release: 'v16.6dm46l',
    title: 'Tus errores ahora entrenan de verdad',
    highlights: [
      'Puzzles personales pone tus errores reales en una cola clara: al superarlos salen de la rotación normal pero siguen disponibles en el histórico.',
      'Cuando faltan ejercicios, Workers AI puede proponer variantes de tus cagadas y el motor local descarta cualquier posición que no valide antes de guardarla.',
      'La generación trabaja por lotes y con cooldown para gastar IA sólo cuando aporta material nuevo.',
      'Studio Marfil es la apariencia inicial para cuentas nuevas por su lectura limpia de las piezas; tus preferencias actuales se respetan.',
    ],
  },
  {
    release: 'v16.6dm46k',
    title: 'Resiliencia operativa sin sacrificar partidas',
    highlights: [
      'Las funciones secundarias ceden capacidad antes que movimiento, login y persistencia cuando el backend está bajo presión.',
      'Administración muestra burn rate, dependencias, señales del frontend y marcas de deploy sobre los gráficos.',
      'La evaluación paralela permite comparar mejoras internas sin cambiar ninguna respuesta para el jugador y permanece desactivada por defecto en Render Free.',
      'Feedback pasa a la cabecera, junto a Cuenta, para que sea visible desde cualquier pantalla sin buscarlo al final de Home.',
    ],
  },
  {
    release: 'v16.6dm46j',
    title: 'Release health y operación trazable',
    highlights: [
      'Administración muestra error budget y salud de la release actual usando tráfico real, sin identificar jugadores.',
      'Las peticiones llevan una referencia y versión de cliente para correlacionar fallos; los logs HTTP pasan a formato estructurado sin guardar contenido de partida.',
      'Un probe sintético programado comprueba liveness/readiness de producción y puede validar también login con una cuenta técnica opcional.',
    ],
  },
  {
    release: 'v16.6dm46i',
    title: 'Primer minuto más claro + operación más seria',
    highlights: [
      'La bienvenida guía por una partida, un puzzle y Así juegas con progreso real, sin obligarte a aprender todos los modos.',
      'Los fallos técnicos se convierten en mensajes recuperables y el equipo conserva una referencia segura cuando hace falta diagnosticar.',
      'Chess Studio gana flags operables desde backend y un SLO visible de disponibilidad/latencia en Administración.',
    ],
  },
  {
    release: 'v16.6dm46h',
    title: 'Puzzles que ya muerden + feedback visible',
    highlights: [
      'El banco clásico sube a 30 posiciones y añade mates en 2/3, sacrificios y combinaciones largas con dificultad visible.',
      'La rotación evita repetir tipo y dificultad para que los ejercicios fáciles no monopolicen la sesión.',
      'Feedback aparece antes en Home, conserva su nombre en móvil y puede pedir un pulso post-partida de forma ocasional y no invasiva.',
    ],
  },
  {
    release: 'v16.6dm46g',
    title: 'Tablero más claro en momentos críticos',
    highlights: [
      'Cuando hay jaque, el rey afectado queda señalado en rojo directamente sobre el tablero.',
      'El marco distingue con discreción tu turno de la espera de la CPU.',
      'El tablero mejora sus indicaciones para teclado y lectores de pantalla.',
    ],
  },
  {
    release: 'v16.6dm46f',
    title: 'Puzzles con más variedad real',
    highlights: [
      'El banco crece con remates, horquillas, diagonales, columnas abiertas, promociones y capturas con todas las piezas.',
      'Siguiente puzzle evita los últimos ejercicios y alterna el tipo de reto siempre que hay una alternativa.',
      'El entrenamiento explica la rotación para que sea fácil entender qué estás practicando.',
    ],
  },
  {
    release: 'v16.6dm46e',
    title: 'Primeros pasos y conexión más claros',
    highlights: [
      'Las cuentas nuevas confirman que empiezan desde cero y llevan directamente al primer rival de Torneo.',
      'Los problemas de conexión ya no muestran errores técnicos: explican qué hacer y permiten reintentar sin recargar.',
      'Login, bienvenida y flujos principales se comprueban también en móviles de 360, 390 y 430 px.',
    ],
  },
  {
    release: 'v16.6dm46d',
    title: 'Dominio propio y catálogo de pruebas',
    highlights: [
      'Chess Studio ya puede publicarse desde su propio dominio, con rutas y recuperación de cuenta alineadas.',
      'Las cuentas administradoras tienen acceso de prueba a todas las apariencias, tableros, armas y mercenarios sin alterar el progreso real.',
    ],
  },
  {
    release: 'v16.6dm46c',
    title: 'Más personalidad dentro y fuera del tablero',
    highlights: [
      'Cinco estilos nuevos de piezas: Regimiento Español, Shogunato Neón, Cyber, Marines y Delta, desbloqueables al avanzar en Torneo.',
      'Combat incorpora mercado en preparación y despliegue, con mercenarios reconocibles en tu ejército y sobre el tablero.',
      'Al revelar una solución, tu jugada queda marcada en rojo y la alternativa del motor en azul, con origen, destino y notación.',
      'Home y Aprender tienen tarjetas más visuales; proteger una racha muestra tu saldo y explica para qué sirven los puntos.',
      'La radio empieza en Aleatorio, recuerda tu selección y recupera anterior/siguiente desde las teclas multimedia.',
      'Las lecciones aparecen ordenadas: aperturas y gambitos primero; defensas después.',
    ],
  },
  {
    release: 'v16.6dm46a',
    title: 'Progreso accionable y economía de Combat',
    highlights: [
      'Mi progreso se reorganiza en Resumen, Rendimiento, Aperturas y Archivo.',
      'Combat separa rango, créditos y XP de unidad, y añade equipo y contratos mercenarios opcionales.',
      'La campaña base sigue siendo ganable sin comprar bonus ni mercenarios.',
    ],
  },
  {
    release: 'v16.6dm45w',
    title: 'Desafíos que construyen carrera',
    highlights: [
      'El rating muestra evolución de hoy, 7 días y 30 días.',
      'Los desafíos diarios cuentan retos, plenos y rachas, con distintivos medibles.',
    ],
  },
]);

export function currentUserReleaseNotes(release = APP_RELEASE) {
  return USER_RELEASE_NOTES.find((entry) => entry.release === release) || USER_RELEASE_NOTES[0];
}
