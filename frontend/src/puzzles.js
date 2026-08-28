// Banco curado. `solution` contiene la línea completa en SAN, alternando
// jugador/rival. Los índices pares son siempre las jugadas del jugador; las
// respuestas rivales se reproducen automáticamente cuando la línea las usa.

export const PUZZLE_DIFFICULTY_LABELS = Object.freeze({
  easy: 'Fácil',
  medium: 'Media',
  hard: 'Difícil',
  brutal: 'Brutal',
});

export const PUZZLES = [
  {
    id: 'mate1_backrank', kind: 'mate1', difficulty: 'easy', technique: 'mate de pasillo',
    title: 'Mate en 1',
    description: 'El rey negro está encerrado por sus propios peones. Encuentra el mate en una jugada.',
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', solution: ['Ra8#'],
  },
  {
    id: 'mate1_rook_kingside', kind: 'mate1', difficulty: 'easy', technique: 'mate de pasillo',
    title: 'Mate en 1',
    description: 'Mismo patrón, distinta posición de la torre. ¿Cuál es la jugada ganadora?',
    fen: '6k1/5ppp/8/8/8/8/7P/R6K w - - 0 1', solution: ['Ra8#'],
  },
  {
    id: 'mate1_queen_kingside', kind: 'mate1', difficulty: 'easy', technique: 'red de mate',
    title: 'Mate en 1',
    description: 'Esta vez es la dama la que da el golpe final. Encuentra el mate.',
    fen: '6k1/5ppp/8/8/8/8/7P/Q6K w - - 0 1', solution: ['Qa8#'],
  },
  {
    id: 'mate1_queenside', kind: 'mate1', difficulty: 'easy', technique: 'mate de pasillo',
    title: 'Mate en 1',
    description: 'El rey negro está en la otra esquina esta vez. Busca el mate.',
    fen: 'k7/pp6/8/8/8/8/8/6KR w - - 0 1', solution: ['Rh8#'],
  },
  {
    id: 'material_bishop', kind: 'material', difficulty: 'easy', technique: 'pieza indefensa',
    title: 'Gana material',
    description: 'Hay una torre negra completamente sin defender. Encuentra la captura.',
    fen: 'r3k3/8/8/8/4B3/8/8/4K3 w - - 0 1', solution: ['Bxa8'],
  },
  {
    id: 'material_fork_knight', kind: 'material', difficulty: 'medium', technique: 'horquilla',
    title: 'Gana material · horquilla',
    description: 'El caballo entra con jaque y después cobra una torre. Calcula también la respuesta rival.',
    fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', solution: ['Nc7+', 'Kd8', 'Nxa8'],
  },
  {
    id: 'mate1_h8', kind: 'mate1', difficulty: 'easy', technique: 'red de mate',
    title: 'Mate en 1',
    description: 'El rey negro está atrapado en h8. La dama puede cerrar la partida de inmediato.',
    fen: '7k/8/6K1/8/8/8/Q7/8 w - - 0 1', solution: ['Qa8#'],
  },
  {
    id: 'mate1_diagonal_net', kind: 'mate1', difficulty: 'easy', technique: 'diagonal',
    title: 'Mate en 1 · red diagonal',
    description: 'La dama tiene una diagonal larga hasta la octava fila. Encuentra el remate.',
    fen: '7k/6pp/8/8/8/7Q/6PP/6K1 w - - 0 1', solution: ['Qc8#'],
  },
  {
    id: 'material_rook_skewer', kind: 'material', difficulty: 'easy', technique: 'columna abierta',
    title: 'Gana la dama · columna abierta',
    description: 'La torre tiene una línea limpia hacia la pieza más valiosa. No hace falta complicarlo.',
    fen: 'q3k3/8/8/8/8/8/8/R3K3 w - - 0 1', solution: ['Rxa8+'],
  },
  {
    id: 'material_queen_corner', kind: 'material', difficulty: 'easy', technique: 'diagonal larga',
    title: 'Gana material · esquina',
    description: 'Revisa las diagonales largas antes de mover. Hay una torre al alcance.',
    fen: '6k1/8/8/4Q3/8/8/8/r3K3 w - - 0 1', solution: ['Qxa1'],
  },
  {
    id: 'material_knight_double_attack', kind: 'material', difficulty: 'medium', technique: 'ataque doble',
    title: 'Horquilla de caballo',
    description: 'El caballo amenaza dos torres. Calcula la secuencia, no sólo el primer salto.',
    fen: 'r3r2k/8/8/3N4/8/8/8/6K1 w - - 0 1', solution: ['Nc7', 'Kg8', 'Nxa8'],
  },
  {
    id: 'material_bishop_diagonal', kind: 'material', difficulty: 'easy', technique: 'diagonal',
    title: 'Alfil en diagonal',
    description: 'Un alfil no necesita estar cerca para encontrar una pieza indefensa.',
    fen: '7k/8/8/8/2B5/8/r7/6K1 w - - 0 1', solution: ['Bxa2'],
  },
  {
    id: 'material_knight_queen', kind: 'material', difficulty: 'easy', technique: 'pieza indefensa',
    title: 'Salto a la dama',
    description: 'Los caballos no siguen líneas: busca el salto que llega a la dama.',
    fen: '6k1/8/8/1q6/8/2N5/8/6K1 w - - 0 1', solution: ['Nxb5'],
  },
  {
    id: 'material_rook_file', kind: 'material', difficulty: 'easy', technique: 'columna abierta',
    title: 'Torre en séptima',
    description: 'La columna está despejada. Calcula hasta dónde puede viajar tu torre.',
    // El rey en f6 protege g7: Rxg7+ gana el caballo sin permitir Kxg7.
    // La versión anterior dejaba la torre colgada y enseñaba una pérdida neta.
    fen: '6k1/6n1/5K2/8/8/8/8/6R1 w - - 0 1', solution: ['Rxg7+'],
  },
  {
    id: 'material_queen_file', kind: 'material', difficulty: 'easy', technique: 'columna abierta',
    title: 'Dama contra torre',
    description: 'Una columna abierta también sirve para recuperar material de inmediato.',
    fen: '2r3k1/8/8/8/8/2Q5/8/6K1 w - - 0 1', solution: ['Qxc8+'],
  },
  {
    id: 'material_bishop_queen', kind: 'material', difficulty: 'easy', technique: 'pieza indefensa',
    title: 'Alfil contra dama',
    description: 'Antes de buscar un ataque, comprueba qué piezas importantes quedaron sin defensa.',
    fen: '7k/5q2/8/8/2B5/8/8/6K1 w - - 0 1', solution: ['Bxf7'],
  },
  {
    id: 'material_promotion_capture', kind: 'material', difficulty: 'medium', technique: 'promoción',
    title: 'Promoción con captura',
    description: 'El peón está a una jugada de cambiar por completo el valor de la posición.',
    fen: '4k2r/6P1/8/8/8/8/8/4K3 w - - 0 1', solution: ['gxh8=Q+'],
  },
  {
    id: 'material_pawn_capture', kind: 'material', difficulty: 'easy', technique: 'peón táctico',
    title: 'Peón táctico',
    description: 'Hasta el peón más modesto puede ganar una pieza cuando está bien colocado.',
    fen: '6k1/8/3n4/4P3/8/8/8/4K3 w - - 0 1', solution: ['exd6'],
  },
  {
    id: 'material_rook_queen', kind: 'material', difficulty: 'easy', technique: 'pieza indefensa',
    title: 'La torre llega primero',
    description: 'La dama rival quedó en la misma columna. Encuentra la captura directa.',
    fen: '6k1/7q/8/8/8/8/8/4K2R w - - 0 1', solution: ['Rxh7'],
  },

  // Posiciones de cálculo: la clave fuerza el mate contra todas las defensas.
  {
    id: 'mate2_queen_rook_box', kind: 'mate2', difficulty: 'medium', technique: 'coordinación dama-torre',
    title: 'Mate en 2 · caja cerrada',
    description: 'No busques una captura. Coordina dama y torre y calcula la única salida del rey.',
    fen: '1k6/4N3/3K4/8/1p6/2Q1p3/2p4R/8 w - - 0 1', solution: ['Qc7+', 'Ka8', 'Rh8#'],
  },
  {
    id: 'mate2_queen_rook_edge', kind: 'mate2', difficulty: 'medium', technique: 'desviación del rey',
    title: 'Mate en 2 · empuja al rey',
    description: 'El primer jaque no mata: coloca al rey exactamente donde la torre lo quiere.',
    fen: '8/7k/7p/5p2/5p2/1Q6/RK6/3N4 w - - 0 1', solution: ['Qf7+', 'Kh8', 'Ra8#'],
  },
  {
    id: 'mate2_rook_ladder', kind: 'mate2', difficulty: 'hard', technique: 'torres coordinadas',
    title: 'Mate en 2 · dos torres',
    description: 'Las dos torres trabajan en filas distintas. Calcula el jaque y el cierre.',
    fen: '8/k7/5R2/7R/1p1p4/6p1/8/B5K1 w - - 0 1', solution: ['Rh7+', 'Ka8', 'Rf8#'],
  },
  {
    id: 'mate3_silent_net', kind: 'mate3', difficulty: 'hard', technique: 'jugada silenciosa',
    title: 'Mate en 3 · sin empezar con jaque',
    description: 'La clave es tranquila. Después las torres van cerrando la red hasta que ya no queda aire.',
    fen: '1B6/4RN1k/K3p3/8/2p5/8/3R4/8 w - - 0 1', solution: ['Rg2', 'c3', 'Re8', 'e5', 'Rh8#'],
  },
  {
    id: 'mate3_rook_king_walk', kind: 'mate3', difficulty: 'brutal', technique: 'coordinación rey-torres',
    title: 'Mate en 3 · el rey también juega',
    description: 'Hay que calcular cinco medias jugadas y usar al rey como pieza activa antes del remate.',
    fen: '8/k7/3K4/3p4/p3R3/8/B4R2/5N2 w - - 0 1', solution: ['Rxa4+', 'Kb8', 'Kc6', 'd4', 'Rf8#'],
  },
  {
    id: 'mate3_quiet_coordination', kind: 'mate3', difficulty: 'brutal', technique: 'red multipieza',
    title: 'Mate en 3 · coordinación total',
    description: 'Rey, dama y alfil tienen tareas distintas. Si sólo miras jaques inmediatos, no sale.',
    fen: 'k7/6B1/8/Kp5p/1p2N1R1/Q6p/8/8 w - - 0 1', solution: ['Kb6+', 'Kb8', 'Qa6', 'h2', 'Be5#'],
  },

  // Sólo mantenemos combinaciones forzadas contra defensa óptima. Las trampas
  // históricas Légal/Englund/Budapest/Blackburne se retiraron del banco normal:
  // dependen de que el rival acepte un cebo inferior y PuzzleScreen reproduce
  // literalmente la respuesta almacenada, así que no eran ejercicios objetivos.
  {
    id: 'combo_opera_finale', kind: 'combination', difficulty: 'hard', technique: 'sacrificio de dama y mate de torre',
    title: 'Final de la Ópera · dama por mate',
    description: 'La dama se sacrifica con jaque para desviar al caballo. Después sólo queda cerrar el telón.',
    fen: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w - - 0 16',
    solution: ['Qb8+', 'Nxb8', 'Rd8#'],
  },
];

function excludedIds(exclude) {
  if (Array.isArray(exclude)) return new Set(exclude.filter(Boolean));
  return new Set(exclude ? [exclude] : []);
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Evita posiciones recientes y, siempre que el banco lo permita, también
// repetir inmediatamente el mismo tipo y la misma dificultad. Elegimos antes
// una dificultad y después una posición para que los numerosos ejercicios
// fáciles no ahoguen a los de cálculo largo.
export function randomPuzzle(exclude = null, previousKind = null, previousDifficulty = null) {
  const excluded = excludedIds(exclude);
  const fresh = PUZZLES.filter((p) => !excluded.has(p.id));
  const base = fresh.length > 0 ? fresh : PUZZLES.filter((p) => p.id !== [...excluded][0]);
  const differentKind = previousKind ? base.filter((p) => p.kind !== previousKind) : base;
  const kindPool = differentKind.length > 0 ? differentKind : base;
  const differentDifficulty = previousDifficulty ? kindPool.filter((p) => p.difficulty !== previousDifficulty) : kindPool;
  const pool = differentDifficulty.length > 0 ? differentDifficulty : kindPool.length > 0 ? kindPool : PUZZLES;
  const difficulties = [...new Set(pool.map((p) => p.difficulty || 'easy'))];
  const difficulty = randomItem(difficulties);
  return randomItem(pool.filter((p) => (p.difficulty || 'easy') === difficulty));
}
