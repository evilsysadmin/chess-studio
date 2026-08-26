// puzzles.js — Banco de puzzles curados a mano. Cada uno se validó con
// chess.js antes de subirlo (ver el historial de la conversación de diseño):
// la secuencia de `solution` realmente termina en jaque mate (o, en los de
// "gana material", en una captura legal de una pieza sin defensa).
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
    id: 'mate1_h8',
    kind: 'mate1',
    title: 'Mate en 1',
    description: 'El rey negro está atrapado en h8. La dama puede cerrar la partida de inmediato.',
    fen: '7k/8/6K1/8/8/8/Q7/8 w - - 0 1',
    solution: ['Qa8#'],
  },
  {
    id: 'mate1_diagonal_net',
    kind: 'mate1',
    title: 'Mate en 1 · red diagonal',
    description: 'La dama tiene una diagonal larga hasta la octava fila. Encuentra el remate.',
    fen: '7k/6pp/8/8/8/7Q/6PP/6K1 w - - 0 1',
    solution: ['Qc8#'],
  },
  {
    id: 'material_rook_skewer',
    kind: 'material',
    title: 'Gana la dama · columna abierta',
    description: 'La torre tiene una línea limpia hacia la pieza más valiosa. No hace falta complicarlo.',
    fen: 'q3k3/8/8/8/8/8/8/R3K3 w - - 0 1',
    solution: ['Rxa8+'],
  },
  {
    id: 'material_queen_corner',
    kind: 'material',
    title: 'Gana material · esquina',
    description: 'Revisa las diagonales largas antes de mover. Hay una torre al alcance.',
    fen: '6k1/8/8/4Q3/8/8/8/r3K3 w - - 0 1',
    solution: ['Qxa1'],
  },
  {
    id: 'material_knight_double_attack',
    kind: 'material',
    title: 'Horquilla de caballo',
    description: 'El caballo puede atacar dos torres. Primero fuerza al rey a decidir.',
    fen: 'r3r2k/8/8/3N4/8/8/8/6K1 w - - 0 1',
    solution: ['Nc7', 'Kg8', 'Nxa8'],
  },
  {
    id: 'material_bishop_diagonal',
    kind: 'material',
    title: 'Alfil en diagonal',
    description: 'Un alfil no necesita estar cerca para encontrar una pieza indefensa.',
    fen: '7k/8/8/8/2B5/8/r7/6K1 w - - 0 1',
    solution: ['Bxa2'],
  },
  {
    id: 'material_knight_queen',
    kind: 'material',
    title: 'Salto a la dama',
    description: 'Los caballos no siguen líneas: busca el salto que llega a la dama.',
    fen: '6k1/8/8/1q6/8/2N5/8/6K1 w - - 0 1',
    solution: ['Nxb5'],
  },
  {
    id: 'material_rook_file',
    kind: 'material',
    title: 'Torre en séptima',
    description: 'La columna está despejada. Calcula hasta dónde puede viajar tu torre.',
    fen: '6k1/6n1/8/8/8/8/8/K5R1 w - - 0 1',
    solution: ['Rxg7+'],
  },
  {
    id: 'material_queen_file',
    kind: 'material',
    title: 'Dama contra torre',
    description: 'Una columna abierta también sirve para recuperar material de inmediato.',
    fen: '2r3k1/8/8/8/8/2Q5/8/6K1 w - - 0 1',
    solution: ['Qxc8+'],
  },
  {
    id: 'material_bishop_queen',
    kind: 'material',
    title: 'Alfil contra dama',
    description: 'Antes de buscar un ataque, comprueba qué piezas importantes quedaron sin defensa.',
    fen: '7k/5q2/8/8/2B5/8/8/6K1 w - - 0 1',
    solution: ['Bxf7'],
  },
  {
    id: 'material_promotion_capture',
    kind: 'material',
    title: 'Promoción con captura',
    description: 'El peón está a una jugada de cambiar por completo el valor de la posición.',
    fen: '4k2r/6P1/8/8/8/8/8/4K3 w - - 0 1',
    solution: ['gxh8=Q+'],
  },
  {
    id: 'material_pawn_capture',
    kind: 'material',
    title: 'Peón táctico',
    description: 'Hasta el peón más modesto puede ganar una pieza cuando está bien colocado.',
    fen: '6k1/8/3n4/4P3/8/8/8/4K3 w - - 0 1',
    solution: ['exd6'],
  },
  {
    id: 'material_rook_queen',
    kind: 'material',
    title: 'La torre llega primero',
    description: 'La dama rival quedó en la misma columna. Encuentra la captura directa.',
    fen: '6k1/7q/8/8/8/8/8/4K2R w - - 0 1',
    solution: ['Rxh7'],
  },
];

function excludedIds(exclude) {
  if (Array.isArray(exclude)) return new Set(exclude.filter(Boolean));
  return new Set(exclude ? [exclude] : []);
}

// La rotación recibe varios IDs recientes. Así el botón "Siguiente" no se
// limita a evitar el último puzzle: evita volver a la misma mini-rutina y, si
// puede, alterna además el tipo de ejercicio (mate, material, etc.).
export function randomPuzzle(exclude = null, previousKind = null) {
  const excluded = excludedIds(exclude);
  const fresh = PUZZLES.filter((p) => !excluded.has(p.id));
  const pool = fresh.length > 0 ? fresh : PUZZLES.filter((p) => p.id !== [...excluded][0]);
  const varied = previousKind ? pool.filter((p) => p.kind !== previousKind) : pool;
  const list = varied.length > 0 ? varied : pool.length > 0 ? pool : PUZZLES;
  return list[Math.floor(Math.random() * list.length)];
}
