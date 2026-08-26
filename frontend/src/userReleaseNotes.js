import { APP_RELEASE } from './release.js';

export const USER_RELEASE_NOTES_KEY = 'chess-study-user-release-notes-seen';

// Changelog de producto: sólo cambios que el jugador ve, entiende o puede usar.
// Infraestructura, nombres internos, hashes y recuentos de tests se quedan fuera.
export const USER_RELEASE_NOTES = Object.freeze([
  {
    release: 'v16.6dm46r',
    title: 'Salud del servicio más visible',
    highlights: [
      'Chess Studio puede conectar su API con un panel privado de salud para detectar errores y lentitud antes de que afecten a una partida.',
      'La monitorización usa datos técnicos agregados: nunca envía tus partidas, posiciones, mensajes ni datos de cuenta.',
    ],
  },
  {
    release: 'v16.6dm46m',
    title: 'Combat más claro y radio con más alma',
    highlights: [
      'Los mercenarios ya no se confunden con reclutas: llegan con una especialización útil desde la primera batalla, cuestan créditos y trabajan sólo por contrato. No acumulan XP ni se convierten en veteranos.',
      'La radio suma seis ambientes originales: blues del desierto nocturno, manouche oscuro, post-rock minimalista, flamenco-jazz nocturno, psicodelia anatolia instrumental y surf noir.',
      'Las guitarras actuales tienen frases más largas, melodías que se responden y cambios de sección para que la sesión respire en vez de girar sobre un loop corto.',
      'En Combate el tablero recupera protagonismo: el reproductor no invade la mesa. Feedback vuelve a llevar su peón de apoyo, abre sin romper la pantalla y empieza en “Comentario general”.',
    ],
  },
  {
    release: 'v16.6dm46k',
    title: 'Partidas más seguras y feedback más accesible',
    highlights: [
      'En momentos de mucha actividad, Chess Studio protege antes que nada el movimiento, el acceso y el guardado de tu partida.',
      'Los errores de una función secundaria no interrumpen una partida en curso ni borran tu progreso.',
      'Feedback pasó a la cabecera, junto a Cuenta, para que esté disponible desde cualquier pantalla.',
    ],
  },
  {
    release: 'v16.6dm46j',
    title: 'Conexión más fácil de recuperar',
    highlights: [
      'Cuando algo falla, Chess Studio explica qué puedes hacer y conserva una referencia segura para soporte.',
      'La conexión y el acceso se revisan continuamente para detectar problemas antes de que afecten a una sesión.',
    ],
  },
  {
    release: 'v16.6dm46i',
    title: 'Primer minuto más claro',
    highlights: [
      'La bienvenida guía por una partida, un puzzle y Así juegas con progreso real, sin obligarte a aprender todos los modos.',
      'Los fallos técnicos se convierten en mensajes recuperables y el equipo conserva una referencia segura cuando hace falta diagnosticar.',
      'Las funciones opcionales pueden apartarse temporalmente para que sigas jugando con normalidad.',
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
