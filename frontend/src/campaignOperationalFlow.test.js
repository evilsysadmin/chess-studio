// STATIC CONTRACT: el flujo de campaña debe obligar a pasar por despliegue confirmado.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(dir, 'components', name), 'utf8');

describe('Combat Chess · flujo operacional de campaña', () => {
  it('la campaña activa confirmación obligatoria de despliegue antes de CombatScreen', () => {
    const roguelike = read('RoguelikeScreen.jsx');
    expect(roguelike).toContain('requireDeploymentConfirmation');
    expect(roguelike).toContain('<CampaignOperationSteps active="target" />');
  });

  it('el controller abre despliegue al entrar y bloquea startBattle sin confirmación', () => {
    const controller = read('useCombatController.js');
    expect(controller).toContain('Boolean(requireDeploymentConfirmation && !restoredSession)');
    expect(controller).toContain('requireDeploymentConfirmation && !deploymentConfirmed');
    expect(controller).toContain('function handleConfirmDeployment()');
    expect(controller).toContain('if (!isDeploymentReadyForBattle(roster)) return false;');
    expect(controller).toContain('setDeploymentConfirmed(true);');
    expect(controller).toContain('requireDeploymentConfirmation && !isDeploymentReadyForBattle(roster)');
  });

  it('la preparación de campaña separa situación, fuerza, confirmación e inicio de combate', () => {
    const source = read('CampaignCombatPreparation.jsx');
    expect(source).toContain('<CampaignOperationSteps active="deployment" />');
    expect(source).toContain('campaign-situation-banner');
    expect(source).toContain('campaign-force-readiness');
    expect(source).toContain('deploymentConfirmed ?');
    expect(source).toContain('handleStartBattleClick');
    expect(source).toContain('onConfirm={handleConfirmDeployment}');
    expect(source).toContain('requireExplicitConfirmation');
  });

  it('briefing comunica la secuencia antes de preparar la fuerza', () => {
    const source = read('CampaignBriefing.jsx');
    expect(source).toContain('<CampaignOperationSteps active="briefing" />');
    expect(source).toContain('campaign-operation-primary-zone');
    expect(source).toContain('onClick={onContinue}');
  });

  it('el modal de deployment distingue cerrar de confirmar', () => {
    const source = read('CombatDeploymentView.jsx');
    expect(source).toContain('onConfirm,');
    expect(source).toContain('requireExplicitConfirmation = false');
    expect(source).toContain('if (onConfirm) onConfirm();');
    expect(source).toContain('summary.fallenCount === 0');
  });
});
