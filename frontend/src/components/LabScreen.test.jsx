import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
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
    expect(html).toContain('EXPERIMENTAL · EN PULIDO');
    expect(html).toContain('POC · JUGABLE');
    expect(html).toContain('MADURO · HERRAMIENTA');
    expect(html).toContain('EXPERIMENTAL · VARIANTE');
  });

  it('no usa detalles de implementación o novedad como jerarquía principal', () => {
    const html = renderHub();

    expect(html).not.toContain('THREE.JS');
    expect(html).not.toContain('BABYLON.JS');
    expect(html).not.toContain('RUN &amp; GUN · THREE.JS · NUEVO');
  });
});
