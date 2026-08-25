import { APP_RELEASE } from './release.js';

export const USER_RELEASE_NOTES_KEY = 'chess-study-user-release-notes-seen';

// Changelog de producto: sólo cambios que el jugador ve, entiende o puede usar.
// Infraestructura, nombres internos, hashes y recuentos de tests se quedan fuera.
export const USER_RELEASE_NOTES = Object.freeze([
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
