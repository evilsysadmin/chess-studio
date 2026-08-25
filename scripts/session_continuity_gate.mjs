#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];
const requireText = (source, token, label) => {
  if (!source.includes(token)) failures.push(label);
};

const restore = read('frontend/src/useActiveSessionRestore.js');
const main = read('frontend/src/main.jsx');
const app = read('frontend/src/App.jsx');
const outcome = read('frontend/src/gameOutcome.js');
const combat = read('frontend/src/components/useCombatController.js');
const smoke = read('e2e/smoke.spec.js');
const ci = read('.github/workflows/ci.yml');

requireText(restore, "return classifyRestoreFailure(error) === 'stale-session';", 'restauración debe distinguir sesión obsoleta de fallo transitorio');
requireText(restore, "Tu sesión sigue guardada; reintenta cuando vuelva el servidor.", 'fallo transitorio debe conservar snapshot y ofrecer reintento');

const catchStart = restore.indexOf('} catch (error) {');
const finallyStart = restore.indexOf('} finally {', catchStart);
const catchBlock = catchStart >= 0 && finallyStart > catchStart ? restore.slice(catchStart, finallyStart) : '';
const staleStart = catchBlock.indexOf("if (shouldLeaveActiveRouteAfterRestoreFailure(error))");
const elseStart = catchBlock.indexOf('} else {', staleStart);
const staleBlock = staleStart >= 0 && elseStart > staleStart ? catchBlock.slice(staleStart, elseStart) : '';
const transientBlock = elseStart >= 0 ? catchBlock.slice(elseStart) : '';
if (!staleBlock.includes("replaceView('menu')")) failures.push('sesión 403/404 debe poder volver al menú porque ya no es recuperable');
if (transientBlock.includes("replaceView('menu')")) failures.push('red/5xx no puede expulsar una partida recuperable al menú');

requireText(main, "import { installReleaseContinuity } from './releaseContinuity.js'", 'arranque debe instalar recuperación de chunks entre releases');
requireText(main, 'installReleaseContinuity();', 'arranque debe activar recuperación de chunks antes de renderizar');
requireText(main, "import AppRootErrorBoundary from './components/AppRootErrorBoundary.jsx'", 'arranque debe conservar ErrorBoundary raíz');
requireText(main, '<AppRootErrorBoundary>', 'App debe quedar bajo el ErrorBoundary raíz');
requireText(app, 'useActiveSessionRestore({', 'App debe conservar restauración de sesión activa');
requireText(app, 'useActiveGameSessionPersistence({', 'App debe conservar persistencia de sesión activa');
requireText(app, 'useGameReconnect({', 'App debe conservar reconciliación tras reconexión');
requireText(app, '<ReleaseUpdateNotice deferReload={isBoardGameView} />', 'deploy/update debe diferir reload mientras hay tablero activo');
requireText(app, 'Reintentar recuperación', 'ruta de partida sin modelo cargado debe ofrecer reintento explícito');
requireText(app, 'La partida sigue guardada.', 'ruta de recuperación debe tranquilizar sin saltar a Home');
requireText(outcome, "if (!explicitAction && recoverableSession) return 'resume';", 'reload/cierre recuperable no puede convertirse en rendición');

const suspendStart = combat.indexOf('function suspendBattleToMenu()');
const retireStart = combat.indexOf('function retireBattle', suspendStart);
const suspendBlock = suspendStart >= 0 && retireStart > suspendStart ? combat.slice(suspendStart, retireStart) : '';
if (!suspendBlock.includes('persistBattleSession()')) failures.push('Salir al menú en Combat debe persistir la batalla');
for (const forbidden of ['onBattleResult', 'clearCombatBattleSession', 'retireBattle']) {
  if (suspendBlock.includes(forbidden)) failures.push(`Salir al menú en Combat no puede ejecutar ${forbidden}`);
}

for (const scenario of [
  'una partida activa sobrevive a reload/deploy y vuelve al tablero',
  'Torneo · una partida activa sobrevive a reload y no vuelve al menú',
  'un 503 al restaurar conserva la ruta y permite reintentar sin caer a Home',
  'una batalla activa sobrevive a reload y no vuelve a Setup',
  'salir al menú conserva campaña y batalla activas',
]) {
  if (!smoke.includes(scenario)) failures.push(`falta regresión E2E de continuidad: ${scenario}`);
}
for (const ciPattern of [
  'Partida rápida · una partida activa',
  'Torneo · una partida activa',
  'Partida rápida · un 503 al restaurar',
  'Combat Chess · salir al menú conserva campaña',
]) {
  if (!ci.includes(ciPattern)) failures.push(`CI crítico no ejecuta la regresión de continuidad: ${ciPattern}`);
}

if (failures.length) {
  console.error('session-continuity-gate FAIL');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('session-continuity-gate OK · normal/tournament restore policy + deploy + Combat continuity protected');
