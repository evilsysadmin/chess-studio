// STATIC CONTRACT: protege que la batalla Combat reuse la mesa visual de partida sin chat/ruido narrativo.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.join(dir, relative), 'utf8');

describe('Combat Chess · mesa de batalla coherente con el resto de partidas', () => {
  it('reutiliza el mobiliario visual de GameScreen sin Game Chat ni comentarios de audiencia', () => {
    const source = read('components/CombatBattleView.jsx');
    expect(source).toContain('board-live-row combat-board-live-row');
    expect(source).toContain('game-music-rail');
    expect(source).toContain('game-board-stack');
    expect(source).toContain('game-side-column combat-game-side-column');
    expect(source).toContain('combat-tactical-panel');
    expect(source).not.toContain("import GameChat");
    expect(source).not.toContain("import CpuPresence");
    expect(source).not.toContain('audience-reaction');
  });

  it('el panel lateral prioriza estado táctico y deja la explicación secundaria plegada', () => {
    const source = read('components/CombatBattleView.jsx');
    expect(source).toContain('combat-tactical-summary-grid');
    expect(source).toContain('combat-log-section');
    expect(source).toContain('<details className="combat-quick-help">');
  });

  it('oculta el reproductor global sólo mientras la batalla Combat usa el reproductor de la mesa', () => {
    const app = read('App.jsx');
    const combat = read('components/CombatScreen.jsx');
    const roguelike = read('components/RoguelikeScreen.jsx');
    expect(app).toContain('combatBattleUiActive');
    expect(app).toContain("view === 'game' || view === 'tournamentGame' || combatBattleUiActive");
    expect(combat).toContain("props.onBattleUiActive?.(controller.phase !== 'setup')");
    expect(combat).not.toMatch(/\buseLayoutEffect\s*\(/);
    expect(roguelike).toContain('onBattleUiActive={onBattleUiActive}');
  });


  it('una batalla viva no depende de un booleano React desfasado para volver a montarse', () => {
    const roguelike = read('components/RoguelikeScreen.jsx');
    const controller = read('components/useCombatController.js');
    const session = read('combatSession.js');
    expect(roguelike).toContain('campaignBattleSessionPresent');
    expect(roguelike).toContain('runBattleSessionPresent');
    expect(roguelike).toContain("campaign.phase === 'fighting' && !campaignBattleSessionPresent");
    expect(roguelike).toContain("run.phase === 'fighting' && !runBattleSessionPresent");
    expect(controller).toContain('if (!canReturnCombatToSetup({ phase, combatVariant }))');
    expect(session).toContain("return !(phase === 'battle' && combatVariant === 'roguelike');");
    expect(controller).toContain('Transición battle -> setup bloqueada');
    expect(session).toContain('const memorySnapshots = new Map()');
    expect(session).toContain('memorySnapshots.set(id, payload)');
  });

  it('usa el vocabulario confirmar despliegue', () => {
    const deployment = read('components/CombatDeploymentView.jsx');
    expect(deployment).toContain('CONFIRMAR DESPLIEGUE');
    expect(deployment).not.toContain('CONFIRMAR FUERZA');
  });
});
