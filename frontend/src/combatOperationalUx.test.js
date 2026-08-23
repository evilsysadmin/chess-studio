// STATIC CONTRACT: valida wiring/markup estable de Combat Chess; no sustituye interacción E2E.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => {
  const relative = name.startsWith('components/') || ['styles.css', 'combatRanks.js'].includes(name)
    ? name
    : `components/${name}`;
  return fs.readFileSync(path.join(dir, relative), 'utf8');
};

describe('STATIC CONTRACT · Combat Chess operativo', () => {
  it('campaña conserva workspace ancho, una siguiente acción clara y ayuda contextual', () => {
    const source = read('RoguelikeScreen.jsx');
    expect(source).toContain('menu combat-workspace');
    expect(source).toContain('campaign-friendly-next');
    expect(source).toContain('QUÉ HACER AHORA');
    expect(source).toContain('context-help-btn');
  });

  it('deployment conserva instrucción compacta con ayuda contextual sin depender del copy', () => {
    const source = read('CombatDeploymentView.jsx');
    expect(source).toContain('combat-operational-hint');
    expect(source).toContain('context-help-btn');
    expect(source).toContain('tutorialId="combat-deployment"');
  });

  it('deployment arrastra sólo una pieza, marca destino y mantiene visibles las bajas pendientes', () => {
    const source = read('CombatDeploymentView.jsx');
    expect(source).toContain('deployment-drag-ghost');
    expect(source).toContain('deployment-square-drop-hover');
    expect(source).toContain('deployment-casualties');
    expect(source).toContain('summary.fallenCount');
    expect(source).toContain('onRevive?.(unitKey, origin)');
    expect(source).toContain('onReplaceFallen?.(unitKey)');
    expect(source).toContain('onSquareDragLeave={handleSquareDragLeave}');
  });

  it('deployment muestra reserva y desplegados simultáneamente, sin tabs de estado', () => {
    const source = read('CombatDeploymentView.jsx');
    expect(source).toContain('aria-label="Unidades en reserva"');
    expect(source).toContain('aria-label="Unidades desplegadas"');
    expect(source).toContain('deployment-reserve-list');
    expect(source).toContain('deployment-deployed-list');
    expect(source).toContain('deployment-right-rail');
    expect(source).not.toContain('setStatusFilter');
    expect(source).not.toContain('aria-label="Vista del roster"');
  });

  it('deployment usa ficha flotante en hover/focus y click la fija sin panel Inspector permanente', () => {
    const source = read('CombatDeploymentView.jsx');
    const boardSource = read('Board.jsx');
    const styles = read('styles.css');

    expect(source).toContain("import { createPortal } from 'react-dom';");
    expect(source).toContain('function UnitDossierPopover(');
    expect(source).toContain('deployment-unit-dossier-popover');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('onMouseEnter={(event) => previewUnitDossier(unitKey, event)}');
    expect(source).toContain('onFocus={(event) => previewUnitDossier(unitKey, event, true)}');
    expect(source).toContain('onClick={(event) => pinUnitDossier(unitKey, event)}');
    expect(source).toContain('onPieceMouseEnter={previewBoardUnitDossier}');
    expect(source).toContain('onPieceMouseLeave={hideUnitDossierPreview}');
    expect(source).toContain('onPieceClick={pinBoardUnitDossier}');
    expect(source).toContain('onPieceDoubleClick={sendBoardUnitToReserve}');
    expect(source).toContain("if (!unitKey || unitKey === 'k-e') return;");
    expect(source).toContain('onDoubleClick={deployReserveUnitToFirstFreeSlot}');
    expect(source).toContain('const target = firstFreeDeploymentSlotForUnit(roster, unitKey);');
    expect(source).toContain('onDeployUnit(target.key, unitKey);');
    expect(source).toContain('deployment-upgrade-ready');
    expect(source).toContain("const canUpgrade = unitKey !== 'k-e'");
    expect(source).toContain('event.button !== 1');

    expect(boardSource).toContain('onPieceMouseEnter,');
    expect(boardSource).toContain('onPieceMouseLeave,');
    expect(boardSource).toContain('onPieceClick,');
    expect(boardSource).toContain('onPieceDoubleClick,');
    expect(boardSource).toContain('if (e.detail > 1) return;');
    expect(boardSource).toContain('onPieceDoubleClick(square, e);');
    expect(boardSource).toContain("'piece-event-target'");
    expect(styles).toMatch(/\.square \.piece\.piece-event-target[\s\S]*?pointer-events:\s*auto;/);
    expect(boardSource).toContain('e.stopPropagation();');

    expect(source).toContain('deployment-service-dossier');
    expect(source).toContain('service.survivals');
    expect(source).toContain('medals.map');
    expect(source).toContain('techniques.map');
    expect(source).not.toContain('<strong>Inspector</strong>');
  });

  it('muestra insignias de rango sobre las piezas Combat y en listas/ficha', () => {
    const board = read('Board.jsx');
    const deployment = read('CombatDeploymentView.jsx');
    expect(board).toContain('piece-rank-insignia');
    expect(board).toContain('RankInsignia');
    expect(read('components/RankInsignia.jsx')).toContain('data-rank-tooltip');
    expect(read('combatRanks.js')).toContain('pieceRankTooltip');
    expect(board).toContain('rankOrLevel={pieceRankLevels?.[square] ?? pieceLevels?.[square]}');
    expect(deployment).toContain('unit-rank-insignia');
    expect(deployment).toContain('unit-rank-inline');
    expect(deployment).toContain('pieceRankLevels={pieceRankLevels}');
  });

  it('permite gastar XP de pieza desde la Ficha fijada usando el handler persistente del roster', () => {
    const deployment = read('CombatDeploymentView.jsx');
    const campaign = read('CampaignCombatPreparation.jsx');
    const setup = read('CombatSetupView.jsx');
    expect(deployment).toContain('deployment-unit-upgrades');
    expect(deployment).toContain("onClick={() => onBuy(unitKey, 'strength')}");
    expect(deployment).toContain("onClick={() => onBuy(unitKey, 'speed')}");
    expect(deployment).toContain('{pinned ? (');
    expect(deployment).toContain('disabled={bankedXp < strengthCost}');
    expect(deployment).toContain('disabled={bankedXp < speedCost}');
    expect(campaign).toContain('onBuy={handleBuyRosterStat}');
    expect(setup).toContain('onBuy={handleBuyRosterStat}');
  });

  it('la batalla Combat usa el rail derecho equivalente al chat para la bitácora', () => {
    const battle = read('CombatBattleView.jsx');
    const styles = read('styles.css');
    expect(battle).toContain('game-side-column combat-game-side-column');
    expect(battle).toContain('combat-tactical-panel');
    expect(battle).toContain('combat-log-section');
    expect(battle).toContain('combat-log-list');
    expect(battle).toContain('combat-tactical-summary-grid');
    expect(styles).toContain('.combat-log-section');
    expect(styles).toContain('.combat-log-list');
  });
  it('home de campaña empieza simple y esconde progreso/expedientes hasta pedirlos', () => {
    const source = read('RoguelikeScreen.jsx');
    expect(source).toContain('campaign-home-friendly');
    expect(source).toContain('¿Listo para empezar?');
    expect(source).toContain('Empezar campaña →');
    expect(source).toContain('<summary>Ver progreso y opciones</summary>');
    expect(source).toContain('<summary>Ejército y veteranos</summary>');
    expect(source).toContain('Campañas anteriores · {campaignArchive.length}');
    expect(source).not.toContain('campaign-home-facts');
  });

  it('briefing y preparación esconden opciones avanzadas y conservan un CTA principal', () => {
    const briefing = read('CampaignBriefing.jsx');
    const prep = read('CampaignCombatPreparation.jsx');
    expect(briefing).toContain('campaign-intel-optional');
    expect(briefing).toContain('PREPARAR EJÉRCITO →');
    expect(prep).toContain('campaign-preparation-options');
    expect(prep).toContain('Usar formación recomendada');
    expect(prep).toContain('INICIAR COMBATE →');
  });

});
