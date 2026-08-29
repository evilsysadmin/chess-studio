import fs from 'node:fs';

const failures = [];
function read(file) { return fs.readFileSync(file, 'utf8'); }
function requireText(file, needle, message) {
  const text = read(file);
  if (!text.includes(needle)) failures.push(`${file}: ${message}`);
}
function requirePattern(file, pattern, message) {
  const text = read(file);
  if (!pattern.test(text)) failures.push(`${file}: ${message}`);
}

// Autoridad normal: UI valida de forma optimista con chess.js y el backend
// vuelve a resolver SIEMPRE contra python-chess legal_moves antes de persistir.
requireText('frontend/src/components/GameScreen.jsx', 'safeChessMove', 'la partida normal debe validar la jugada local con el contrato común');
requireText('frontend/src/components/GameScreen.jsx', 'api.playMove', 'la partida normal debe confirmar la jugada en backend');
requireText('backend-python/chess_core.py', 'for move in board.legal_moves', 'resolve_move debe iterar únicamente jugadas legales de python-chess');
requirePattern('backend-python/game_api.py', /move\s*=\s*resolve_move\(board,[\s\S]{0,240}?if move is None:[\s\S]{0,120}?Movimiento ilegal/, 'POST /move debe rechazar cualquier movimiento no resuelto como legal');
requireText('backend-python/game_api.py', 'board_from_valid_fen(body.starting_fen)', 'las posiciones iniciales personalizadas deben rechazar FEN imposibles');
requireText('backend-python/game_api.py', 'board_from_valid_fen(body.fen)', 'los endpoints de análisis deben rechazar FEN imposibles');
requireText('backend-python/game_api.py', 'load_stored_game_board(entry)', 'las partidas persistidas corruptas deben degradar a conflicto recuperable');

// Modos que no usan el endpoint /move siguen obligados a pasar por chess.js o
// por la resolución legal de Combat antes de cambiar el tablero.
requireText('frontend/src/components/SpectatorScreen.jsx', 'applySuggestedOrLegalFallback', 'Espectador debe validar/fallbackear sugerencias CPU contra chess.js');
requireText('frontend/src/components/SpectatorScreen.jsx', 'standardChessStatus', 'Espectador debe detectar terminales con el contrato común');
requireText('frontend/src/components/Board3DExperiment.jsx', 'applySuggestedOrLegalFallback', '3D debe validar/fallbackear sugerencias CPU contra chess.js');
requireText('frontend/src/components/Board3DExperiment.jsx', 'standardChessStatus', '3D debe detectar terminales con el contrato común');
requireText('frontend/src/components/PuzzleScreen.jsx', 'matchesExpectedPuzzleMove', 'Puzzles debe comparar la solución sobre una jugada legal real');
requireText('frontend/src/components/PuzzleScreen.jsx', 'localChess.moves', 'Puzzles sólo debe ofrecer movimientos legales');
requireText('frontend/src/puzzleTacticalQuality.js', 'isObviouslyUnsoundSingleMovePuzzle', 'Puzzles personales deben rechazar claves trivialmente refutables');
requireText('frontend/src/puzzleTacticalQuality.js', 'forcedMateIssues', 'mates/combinaciones curados deben probar la clave contra todas las defensas');
requireText('frontend/src/puzzleTacticalQuality.js', 'materialLineIssues', 'puzzles de material deben auditar clave, defensa rival y ganancia neta');
requireText('frontend/src/puzzles.js', 'el alfil blanco de g5 protege esa casilla', 'Final de la Ópera debe explicar por qué Kxd8 es ilegal');
requireText('frontend/src/puzzles.test.js', 'tiene sentido táctico, no sólo un FEN válido', 'el banco curado debe auditar sentido táctico además de legalidad');
requireText('frontend/src/puzzleTacticalQuality.test.js', 'caballo se come un peón inmediatamente', 'debe existir regresión para el jaque suicida refutable por peón');
requireText('frontend/src/aiPersonalPuzzles.js', 'api.analyzeMove', 'los puzzles generados deben validarse contra análisis determinista de la jugada');
requireText('frontend/src/components/LabScreen.jsx', 'assertLegalLabPosition', 'Laboratorio debe validar la posición antes de comenzar');
requireText('frontend/src/components/useCombatController.js', 'resolveCombatMove', 'Combat debe resolver cada movimiento mediante su contrato de variante');
requireText('frontend/src/components/useCombatController.js', 'localChess.moves', 'Combat sólo debe ofrecer movimientos legales del tablero actual');

// Reglas especiales + fuzz en ambos motores. Esto hace que una futura
// refactorización no pueda "simplificar" accidentalmente enroque, EP, etc.
for (const needle of ['pieza clavada', 'enrocar', 'captura al paso', 'cuatro promociones', 'repetición', '50 movimientos', 'material insuficiente', 'fuzz determinista']) {
  requireText('frontend/src/chessRules.test.js', needle, `falta cobertura reglamentaria: ${needle}`);
}
for (const needle of ['pinned', 'castling', 'en_passant', 'promotion', 'threefold', 'fifty', 'insufficient', 'property']) {
  requirePattern('backend-python/test_core_game.py', new RegExp(needle, 'i'), `falta cobertura backend relacionada con ${needle}`);
}

// Matriz E2E: cada familia de modo de juego debe demostrar jaque/mate o, en
// puzzles, un mate resoluble. No es un test decorativo de mera navegación.
const critical = read('e2e/critical-gameplay.spec.js');
for (const mode of ['Partida rápida', 'Torneo', 'Partida de práctica']) {
  if (!critical.includes(mode)) failures.push(`e2e/critical-gameplay.spec.js: falta ${mode}`);
}
if (!/jaque/i.test(critical) || !/mate/i.test(critical)) failures.push('e2e/critical-gameplay.spec.js: faltan escenarios de jaque y mate');

const extended = read('e2e/extended-gameplay.spec.js');
for (const mode of ['Laboratorio', 'Rival Fantasma', 'Serie', 'Puzzles']) {
  if (!extended.includes(mode)) failures.push(`e2e/extended-gameplay.spec.js: falta ${mode}`);
}
if (!/jaque/i.test(extended) || !/mate/i.test(extended)) failures.push('e2e/extended-gameplay.spec.js: faltan escenarios de jaque/mate');

const combat = read('e2e/combat-critical.spec.js');
if (!/Combat Chess/.test(combat) || !/jaque/i.test(combat) || !/mate/i.test(combat)) failures.push('e2e/combat-critical.spec.js: Combat debe cubrir jaque y mate');

const edgeModes = read('e2e/spectator-3d-critical.spec.js');
for (const mode of ['Espectador', 'Tablero 3D']) {
  if (!edgeModes.includes(mode)) failures.push(`e2e/spectator-3d-critical.spec.js: falta ${mode}`);
}
if (!/jaque/i.test(edgeModes) || !/mate/i.test(edgeModes)) failures.push('e2e/spectator-3d-critical.spec.js: Espectador/3D deben cubrir jaque y mate');

if (failures.length) {
  for (const failure of failures) console.error(`ERROR chess rules gate: ${failure}`);
  process.exit(1);
}
console.log('Chess rules gate: OK · autoridad legal común, reglas especiales y matriz E2E protegidas.');
