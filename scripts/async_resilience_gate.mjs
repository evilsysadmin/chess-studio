import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('frontend/src');
const allowedFetchFiles = new Set([path.resolve(root, 'http.js'), path.resolve(root, 'asyncControl.js')]);
const allowedTimerPromiseFiles = new Set([
  path.resolve(root, 'asyncControl.js'),
  // FileReader no expone Promise/AbortSignal; este adaptador incluye su propio
  // watchdog + reader.abort(), por eso es una excepción explícita y revisada.
  path.resolve(root, 'feedbackAttachments.js'),
]);
const extensions = new Set(['.js', '.jsx']);
const directFetch = [];
const directInjectedFetch = [];
const rawSleepPromises = [];
const intervalLeaks = [];

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (extensions.has(path.extname(entry.name)) && !entry.name.includes('.test.')) out.push(full);
  }
  return out;
}

for (const full of sourceFiles(root)) {
  const text = fs.readFileSync(full, 'utf8');
  if (/\bfetch\s*\(/.test(text) && !allowedFetchFiles.has(path.resolve(full))) {
    directFetch.push(path.relative(process.cwd(), full));
  }
  if (/\bfetchImpl\s*\(/.test(text) && path.basename(full) !== 'asyncControl.js') {
    directInjectedFetch.push(path.relative(process.cwd(), full));
  }
  // Las esperas temporizadas deben ser abortables: un Promise+setTimeout crudo
  // sigue ejecutándose tras cambiar de partida/pantalla y es fuente de callbacks zombis.
  if (/new\s+Promise\s*\([\s\S]{0,220}?setTimeout\s*\(/m.test(text) && !allowedTimerPromiseFiles.has(path.resolve(full))) {
    rawSleepPromises.push(path.relative(process.cwd(), full));
  }
  if (/\b(?:window\.)?setInterval\s*\(/.test(text) && !/\b(?:window\.)?clearInterval\s*\(/.test(text)) {
    intervalLeaks.push(path.relative(process.cwd(), full));
  }
}

const contractErrors = [];
function requirePattern(file, pattern, message) {
  const text = fs.readFileSync(path.resolve(file), 'utf8');
  if (!pattern.test(text)) contractErrors.push(`${file}: ${message}`);
}
requirePattern('frontend/src/components/GameScreen.jsx', /api\.playMove\([^\n]+\{\s*signal:\s*controller\.signal[^}]*\}/, 'playMove debe ser cancelable por sesión');
requirePattern('frontend/src/components/GameScreen.jsx', /createGameMutationCoordinator/, 'GameScreen debe delegar ownership de mutaciones al coordinador');
requirePattern('frontend/src/components/GameScreen.jsx', /mutationCoordinator\.begin\(/, 'GameScreen debe adquirir exclusión mutua síncrona antes de mutar');
requirePattern('frontend/src/components/GameScreen.jsx', /mutationCoordinator\.isCurrent\(operation\)/, 'GameScreen debe rechazar respuestas de mutaciones obsoletas');
requirePattern('frontend/src/components/GameScreen.jsx', /mutationCoordinator\.invalidateSession\(/, 'GameScreen debe invalidar mutaciones al cambiar o terminar la sesión');
requirePattern('frontend/src/gameMutationCoordinator.js', /if\s*\(currentOperation\)\s*return\s+null/, 'el coordinador debe impedir mutaciones concurrentes síncronamente');
requirePattern('frontend/src/gameMutationCoordinator.js', /currentOperation\.controller\.abort\(/, 'el coordinador debe poder abortar la mutación activa');
requirePattern('frontend/src/gameMutationCoordinator.js', /operation\?\.session\s*===\s*sessionGeneration/, 'el coordinador debe rechazar operaciones de generaciones antiguas');
requirePattern('frontend/src/gameMutationCoordinator.js', /operationFingerprint\(/, 'el coordinador debe conservar fingerprint de idempotencia para retries');
requirePattern('frontend/src/gameMutationCoordinator.js', /retryOperation[\s\S]{0,520}?retryWindowMs/, 'el coordinador debe limitar la reutilización de Idempotency-Key a una ventana acotada');
requirePattern('frontend/src/components/GameScreen.jsx', /controlResolveRef\.current\?\.\(\)/, 'la Promise de Control táctico debe resolverse al cambiar/desmontar sesión');
requirePattern('frontend/src/components/SpectatorScreen.jsx', /abortableDelay\(/, 'el loop espectador debe usar esperas cancelables');
requirePattern('frontend/src/components/SpectatorScreen.jsx', /analyzePosition\([^\n]+\{\s*signal\s*\}/, 'análisis espectador debe cancelarse');
requirePattern('frontend/src/components/Board3DExperiment.jsx', /analyzePosition\([^\n]+\{\s*signal/, 'análisis 3D debe cancelarse');
requirePattern('frontend/src/components/useCombatController.js', /battleGenerationRef/, 'Combat debe invalidar callbacks de batallas antiguas');
requirePattern('frontend/src/components/useCombatController.js', /analyzePosition\([^\n]+\{\s*signal:\s*controller\.signal\s*\}/, 'análisis Combat debe cancelarse');
requirePattern('frontend/src/components/useCombatController.js', /if\s*\(!result\)\s*\{[\s\S]{0,180}?throw\s+new\s+Error/, 'Combat no puede tratar una resolución nula como jugada completada');
requirePattern('frontend/src/components/useCombatController.js', /resetBossPhase[\s\S]{0,420}?if\s*\(!chess\)[\s\S]{0,180}?setBusy\(false\)/, 'un reset de boss inválido debe liberar busy');
requirePattern('frontend/src/components/InsightsDashboardContent.jsx', /async function startSearch\(\)[\s\S]{0,2600}?finally\s*\{[\s\S]{0,350}?setSearchStatus\('done'\)/, 'la búsqueda de peor jugada debe liberar running incluso si falla');
requirePattern('frontend/src/App.jsx', /api\.createGame\([^\n]+\{\s*signal:\s*launch\.controller\.signal[^}]*\}/, 'crear partida debe poder cancelarse al abandonar la pantalla');
requirePattern('frontend/src/useActiveSessionRestore.js', /restoreRequestRef/, 'restauración debe deduplicar/cancelar respuestas tardías');
requirePattern('frontend/src/components/FeedbackModal.jsx', /submitInFlightRef\.current/, 'Feedback necesita mutex síncrono para impedir doble submit');
requirePattern('frontend/src/components/FeedbackModal.jsx', /submitAbortRef\.current\?\.abort/, 'Feedback debe cancelar el envío al cerrar/desmontar');
requirePattern('frontend/src/components/AdminObservabilitySummary.jsx', /tempoProbeInFlightRef\.current/, 'el probe de trazas debe impedir doble ejecución concurrente');
requirePattern('frontend/src/components/AdminObservabilitySummary.jsx', /signalProbeInFlightRef\.current/, 'el probe de señales debe impedir doble ejecución concurrente');
requirePattern('frontend/src/components/ObservabilityPanel.jsx', /metricsRequestRef\.current\.controller\?\.abort/, 'Observabilidad debe cancelar refresh antiguos');
requirePattern('frontend/src/components/AdminDashboardContent.jsx', /adminDataEpochRef/, 'Admin debe impedir que un poll antiguo pise una mutación nueva');
requirePattern('frontend/src/components/PuzzleScreen.jsx', /aiGenerationInFlightRef\.current/, 'la generación de puzzles AI debe tener exclusión mutua inmediata');
requirePattern('frontend/src/components/LoginScreen.jsx', /submitInFlightRef\.current/, 'auth debe impedir doble submit en el mismo frame');
requirePattern('frontend/src/components/LoginScreen.jsx', /submitAbortRef\.current\?\.abort/, 'auth debe cancelar requests al cambiar/cerrar pantalla');
requirePattern('frontend/src/components/PostGameFeedbackPrompt.jsx', /sendInFlightRef\.current/, 'feedback post-partida debe impedir duplicados concurrentes');
requirePattern('frontend/src/components/ProfileBackupModal.jsx', /operationInFlightRef\.current/, 'backup/reset de perfil no pueden solaparse');

if (directFetch.length || directInjectedFetch.length || rawSleepPromises.length || intervalLeaks.length || contractErrors.length) {
  if (directFetch.length) {
    console.error('ERROR async resilience: fetch() directo fuera de http.js; puede saltarse watchdog/request-id/error normalization:');
    for (const file of directFetch) console.error(`  - ${file}`);
  }
  if (directInjectedFetch.length) {
    console.error('ERROR async resilience: fetchImpl() directo; usa fetchWithTimeout() para conservar watchdog y cancelación:');
    for (const file of directInjectedFetch) console.error(`  - ${file}`);
  }
  if (rawSleepPromises.length) {
    console.error('ERROR async resilience: sleep Promise crudo; usa abortableDelay() para evitar callbacks zombis:');
    for (const file of rawSleepPromises) console.error(`  - ${file}`);
  }
  if (intervalLeaks.length) {
    console.error('ERROR async resilience: setInterval() sin clearInterval() en el mismo módulo:');
    for (const file of intervalLeaks) console.error(`  - ${file}`);
  }
  for (const error of contractErrors) console.error(`ERROR async resilience: ${error}`);
  process.exit(1);
}
console.log('Async resilience: OK · watchdog HTTP, waits cancelables, intervals limpiables y contratos críticos protegidos.');
