import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EXPERIMENT_MATURITY,
  EXPERIMENT_MATURITY_VALUES,
  experimentMaturityLabel,
} from '../experimentMaturity.js';
import { requestLabLaunch } from '../labLaunchIntent.js';
import LabScreen from './LabScreen.jsx';

function renderHub() {
  return renderToStaticMarkup(
    <LabScreen onExit={() => {}} onStart={() => {}} />,
  );
}

describe('LabScreen experiment hub', () => {
  beforeEach(() => requestLabLaunch(null));

  it('presenta los experimentos como secundarios con madurez honesta', () => {
    const html = renderHub();

    expect(html).toContain('ninguno es necesario para disfrutar Chess Studio');
    expect(html).toContain('POC · GODOT WEB');
    expect(html).toContain('EXPERIMENTAL · EN PULIDO');
    expect(html).toContain('POC · JUGABLE');
    expect(html).toContain('MADURO · HERRAMIENTA');
    expect(html).toContain('EXPERIMENTAL · VARIANTE');
  });

  it('expone Pawn Slug Godot y mantiene oculto el portal clásico', () => {
    const html = renderHub();

    expect(html).toContain('lab-workshop-portal--pawnslug-godot');
    expect(html).toContain('PAWN SLUG GODOT');
    expect(html).not.toContain('lab-workshop-portal--pawnslug"');
    expect(html).not.toContain('<strong>Pawn Slug</strong>');
  });

  it('usa un contrato común con todos los estados de madurez del producto', () => {
    expect(EXPERIMENT_MATURITY_VALUES).toEqual([
      EXPERIMENT_MATURITY.POC,
      EXPERIMENT_MATURITY.EXPERIMENTAL,
      EXPERIMENT_MATURITY.MATURE,
      EXPERIMENT_MATURITY.CANONICAL,
      EXPERIMENT_MATURITY.FROZEN,
      EXPERIMENT_MATURITY.RETIRED,
    ]);
    expect(EXPERIMENT_MATURITY_VALUES.map((maturity) => experimentMaturityLabel(maturity))).toEqual([
      'POC',
      'EXPERIMENTAL',
      'MADURO',
      'CANÓNICO',
      'CONGELADO',
      'RETIRADO',
    ]);
    expect(experimentMaturityLabel(EXPERIMENT_MATURITY.EXPERIMENTAL, ' en pulido ')).toBe('EXPERIMENTAL · EN PULIDO');
    expect(() => experimentMaturityLabel('inventado')).toThrow('Unknown experiment maturity');
  });

  it('no usa detalles de implementación o novedad como jerarquía principal', () => {
    const html = renderHub();

    expect(html).not.toContain('THREE.JS');
    expect(html).not.toContain('BABYLON.JS');
    expect(html).not.toContain('RUN &amp; GUN · THREE.JS · NUEVO');
  });
});
