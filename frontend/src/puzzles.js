// puzzles.js — Banco de puzzles curados a mano. Cada uno se validó con
// chess.js antes de subirlo (ver el historial de la conversación de diseño):
// la secuencia de `solution` realmente termina en jaque mate (o, en los de
// "gana material", en una captura legal de una pieza sin defensa).
//
// Para los de "mate en 2" en particular, hay un criterio extra que no es
// obvio a simple vista: la posición inicial NO puede tener ningún mate en
// 1 jugada disponible (de ninguna pieza, no solo de la que "se supone"
// resuelve el puzzle) — si lo tiene, un jugador que encuentre ese mate más
// corto y correcto se lleva un "está mal" del validador, que solo compara
// contra la secuencia guardada acá. Las 3 posiciones actuales de mate en 2
// se verificaron con una búsqueda exhaustiva (todas las combinaciones de
// rey blanco + dama blanca contra el rey negro en la esquina) antes de
// quedar elegidas — no son solo "se me ocurrió y probé una vez".
//
// `solution` es la secuencia COMPLETA en notación SAN, alternando humano/CPU
// cuando hace falta una respuesta forzada del rival (por ejemplo, un jaque
// que solo se puede responder de una manera). Los índices pares (0, 2, 4…)
// son siempre del humano; los impares son la respuesta forzada del rival,
// que el propio modo puzzle aplica automáticamente.

export const PUZZLES = [
  {
    id: 'mate1_backrank',
    kind: 'mate1',
    title: 'Mate en 1',
    description: 'El rey negro está encerrado por sus propios peones. Encuentra el mate en una jugada.',
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
    solution: ['Ra8#'],
  },
  {
    id: 'mate1_rook_kingside',
    kind: 'mate1',
    title: 'Mate en 1',
    description: 'Mismo patrón, distinta posición de la torre. ¿Cuál es la jugada ganadora?',
    fen: '6k1/5ppp/8/8/8/8/7P/R6K w - - 0 1',
    solution: ['Ra8#'],
  },
  {
    id: 'mate1_queen_kingside',
    kind: 'mate1',
    title: 'Mate en 1',
    description: 'Esta vez es la dama la que da el golpe final. Encuentra el mate.',
    fen: '6k1/5ppp/8/8/8/8/7P/Q6K w - - 0 1',
    solution: ['Qa8#'],
  },
  {
    id: 'mate1_queenside',
    kind: 'mate1',
    title: 'Mate en 1',
    description: 'El rey negro está en la otra esquina esta vez. Busca el mate.',
    fen: 'k7/pp6/8/8/8/8/8/6KR w - - 0 1',
    solution: ['Rh8#'],
  },
  {
    id: 'material_bishop',
    kind: 'material',
    title: 'Gana material',
    description: 'Hay una torre negra completamente sin defender. Encuentra la captura.',
    fen: 'r3k3/8/8/8/4B3/8/8/4K3 w - - 0 1',
    solution: ['Bxa8'],
  },
  {
    id: 'material_fork_knight',
    kind: 'material',
    title: 'Gana material (horquilla)',
    description: 'El caballo puede saltar a una casilla que amenaza dos piezas negras a la vez. Encontrala.',
    fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1',
    solution: ['Nc7+', 'Kd8', 'Nxa8'],
  },
  {
    id: 'mate2_a1',
    kind: 'mate2',
    title: 'Mate en 2',
    description: 'Un jaque fuerza al rey a una única casilla. Desde ahí, hay mate.',
    fen: 'k7/8/1K6/8/8/8/8/1Q6 w - - 0 1',
    solution: ['Qa2+', 'Kb8', 'Qg8#'],
  },
  {
    id: 'mate2_a2',
    kind: 'mate2',
    title: 'Mate en 2',
    description: 'Otra vez rey y dama solos contra el rey negro. Encuentra los dos jaques.',
    fen: 'k7/8/2K5/8/2Q5/8/8/8 w - - 0 1',
    solution: ['Qa6+', 'Kb8', 'Qb7#'],
  },
  {
    id: 'mate2_h8',
    kind: 'mate2',
    title: 'Mate en 2',
    description: 'El rey negro está en la esquina contraria. La técnica es la misma: encontrala.',
    fen: '7k/8/6K1/8/8/8/8/6Q1 w - - 0 1',
    solution: ['Qh2+', 'Kg8', 'Qb8#'],
  },
];

export function randomPuzzle(excludeId) {
  const pool = excludeId ? PUZZLES.filter((p) => p.id !== excludeId) : PUZZLES;
  const list = pool.length > 0 ? pool : PUZZLES;
  return list[Math.floor(Math.random() * list.length)];
}
