import { beforeEach, describe, expect, it } from 'vitest';
import { loadRoster } from './combatRoster.js';
import { deploymentSummary, grantReserveRecruit, setDeploymentUnit } from './combatDeployment.js';
import { applyDeploymentPreset, captureDeploymentPreset, loadDeploymentPresets } from './combatDeploymentPresets.js';

beforeEach(() => localStorage.clear());

describe('Combat Chess deployment presets', () => {
  it('guarda nombre y formación y la recupera después de cambiar el deployment', () => {
    let roster = loadRoster();
    roster = grantReserveRecruit(roster, { grantId: 'preset:reserve', originType: 'p', rng: () => 0.4, now: 1000 });
    const reserveKey = deploymentSummary(roster).reserveKeys[0];
    roster = setDeploymentUnit(roster, 'p-a', reserveKey);
    captureDeploymentPreset(roster, 0, 'Equipo A');

    const saved = loadDeploymentPresets()[0];
    expect(saved.name).toBe('Equipo A');
    expect(saved.deployment['p-a']).toBe(reserveKey);

    const changed = setDeploymentUnit(roster, 'p-a', 'p-a');
    const restored = applyDeploymentPreset(changed, saved);
    expect(restored.deployment['p-a']).toBe(reserveKey);
    expect(deploymentSummary(restored).ready).toBe(true);
  });

  it('no crea slots ilegales si una identidad guardada ya no existe', () => {
    const roster = loadRoster();
    const preset = {
      version: 1,
      name: 'Rota',
      deployment: { ...roster.deployment, 'p-a': 'p-no-existe' },
      forms: {},
    };
    const restored = applyDeploymentPreset(roster, preset);
    expect(deploymentSummary(restored).ready).toBe(true);
    expect(restored.deployment['p-a']).not.toBe('p-no-existe');
  });
});
