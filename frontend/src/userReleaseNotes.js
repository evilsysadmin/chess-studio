import { APP_RELEASE } from './release.js';

export const USER_RELEASE_NOTES_KEY = 'chess-study-user-release-notes-seen';

// Changelog de producto: sólo cambios que el jugador ve, entiende o puede usar.
// Infraestructura, nombres internos, hashes y recuentos de tests se quedan fuera.
export const USER_RELEASE_NOTES = Object.freeze([
  {
    release: 'v16.6dm46h',
    title: 'Partidas más fáciles de leer',
    highlights: [
      'Bajo el tablero ves de un vistazo turno, última jugada y estado de guardado.',
      'El cierre de partida presenta el impacto de rating como una tarjeta breve y clara.',
      'Las herramientas de aprendizaje quedan visibles al llegar a esa parte de Home.',
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
