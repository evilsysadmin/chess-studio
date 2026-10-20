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
    expect(saved.version).toBe(2);
    expect(saved.deployment['p-a']).toBe(reserveKey);
    expect(saved.identityIds[reserveKey]).toBe(roster.identities[reserveKey].identityId);

    const changed = setDeploymentUnit(roster, 'p-a', 'p-a');
    const restored = applyDeploymentPreset(changed, saved);
    expect(restored.deployment['p-a']).toBe(reserveKey);
    expect(deploymentSummary(restored).ready).toBe(true);
  });

  it('no confunde un reemplazo con el veterano guardado en el preset', () => {
    let roster = loadRoster();
    roster = grantReserveRecruit(roster, { grantId: 'preset:replacement', originType: 'p', rng: () => 0.4, now: 1000 });
    const reserveKey = deploymentSummary(roster).reserveKeys[0];
    roster = setDeploymentUnit(roster, 'p-a', reserveKey);
    captureDeploymentPreset(roster, 0, 'Veteranos');
    const saved = loadDeploymentPresets()[0];

    // La baja deja libre la clave histórica para una identidad nueva.
    const changed = setDeploymentUnit(roster, 'p-a', 'p-a');
    const replacement = {
      ...changed,
      identities: {
        ...changed.identities,
        [reserveKey]: { ...changed.identities[reserveKey], identityId: 'unit-replacement' },
      },
    };
    const restored = applyDeploymentPreset(replacement, saved);
    expect(restored.deployment['p-a']).toBe('p-a');
    expect(Object.values(restored.deployment)).not.toContain(reserveKey);
    expect(deploymentSummary(restored).ready).toBe(true);
  });

  it('no aplica asignaciones v2 sin prueba de identidad y mantiene los presets v1', () => {
    let roster = loadRoster();
    roster = grantReserveRecruit(roster, { grantId: 'preset:legacy', originType: 'p', rng: () => 0.5, now: 2000 });
    const reserveKey = deploymentSummary(roster).reserveKeys[0];
    roster = setDeploymentUnit(roster, 'p-a', reserveKey);
    captureDeploymentPreset(roster, 0, 'Guardia');
    const saved = loadDeploymentPresets()[0];
    const baseline = setDeploymentUnit(roster, 'p-a', 'p-a');
    const unproven = { ...saved, identityIds: {} };

    expect(applyDeploymentPreset(baseline, unproven).deployment['p-a']).toBe('p-a');
    expect(applyDeploymentPreset(baseline, {
      version: 1, deployment: saved.deployment, forms: saved.forms,
    }).deployment['p-a']).toBe(reserveKey);
    expect(applyDeploymentPreset(baseline, { ...saved, version: 3 }).deployment['p-a']).toBe('p-a');
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
