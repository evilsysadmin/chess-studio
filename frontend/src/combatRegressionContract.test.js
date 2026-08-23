// STATIC CONTRACT: fija el wiring React/DOM de regresiones críticas de Combat Chess.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.join(dir, relative), 'utf8');

describe('STATIC CONTRACT · regresiones críticas de Combat Chess', () => {
  it('el controller bloquea battle → setup antes de limpiar snapshot o cambiar phase', () => {
    const controller = read('components/useCombatController.js');
    expect(controller).toContain('if (!canReturnCombatToSetup({ phase, combatVariant }))');
    const guardIndex = controller.indexOf('if (!canReturnCombatToSetup({ phase, combatVariant }))');
    const clearIndex = controller.indexOf('clearCombatSession(combatSessionId);', guardIndex);
    const setupIndex = controller.indexOf("setPhase('setup');", guardIndex);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeGreaterThan(guardIndex);
    expect(setupIndex).toBeGreaterThan(clearIndex);
  });

  it('Mesa de Guerra mantiene hover=preview, click=ficha, dblclick=banquillo/despliegue y drag=recolocar', () => {
    const board = read('components/Board.jsx');
    const deployment = read('components/CombatDeploymentView.jsx');
    const css = read('styles.css');

    expect(board).toContain('if (e.detail > 1) return;');
    expect(board).toContain('onPieceClick(square, e);');
    expect(board).toContain('onPieceDoubleClick(square, e);');
    expect(board).toContain("'piece-event-target'");
    expect(css).toMatch(/\.square \.piece\.piece-event-target[\s\S]*?pointer-events:\s*auto;/);

    expect(deployment).toContain('onPieceMouseEnter={previewBoardUnitDossier}');
    expect(deployment).toContain('onPieceClick={pinBoardUnitDossier}');
    expect(deployment).toContain('onPieceDoubleClick={sendBoardUnitToReserve}');
    expect(deployment).toContain('onDoubleClick={deployReserveUnitToFirstFreeSlot}');
    expect(deployment).toContain('onPieceDragStart={handleBoardPieceDragStart}');
  });

  it('confirmación y arranque usan la misma fuente de verdad del despliegue antes de expirar bajas', () => {
    const controller = read('components/useCombatController.js');
    expect(controller).toContain('if (!isDeploymentReadyForBattle(roster)) return false;');
    expect(controller).toContain('if (requireDeploymentConfirmation && !isDeploymentReadyForBattle(roster))');
    expect(controller).toContain('if (!isDeploymentReadyForBattle(activeRoster))');
    expect(controller).toContain("onError?.('Confirma el despliegue antes de iniciar la operación.');");
    const preflightIndex = controller.indexOf('if (requireDeploymentConfirmation && !isDeploymentReadyForBattle(roster))');
    const expireIndex = controller.indexOf('expireDeadPieces(roster)', preflightIndex);
    expect(preflightIndex).toBeGreaterThan(-1);
    expect(expireIndex).toBeGreaterThan(preflightIndex);
  });

  it('campaña fighting consulta el snapshot real y no sólo un booleano React', () => {
    const roguelike = read('components/RoguelikeScreen.jsx');
    expect(roguelike).toContain("campaign.phase === 'fighting'");
    expect(roguelike).toContain('hasCombatSession(campaignCombatSessionId)');
    expect(roguelike).toContain('hasCombatSession(runCombatSessionId)');
  });
});
