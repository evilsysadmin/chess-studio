// STATIC CONTRACT: valida intención operativa/markup de Combat Chess; no sustituye interacción E2E.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(dir, 'components', name), 'utf8');

describe('STATIC CONTRACT · Combat Chess operativo', () => {
  it('campaña usa workspace ancho y deriva explicaciones al tutorial/tooltips', () => {
    const source = read('RoguelikeScreen.jsx');
    expect(source).toContain('menu combat-workspace');
    expect(source).toContain('Selecciona una ruta conectada.');
    expect(source).not.toContain('En móvil, el mapa baja por sectores');
  });

  it('deployment mantiene instrucción corta y tooltip para la regla de origen', () => {
    const source = read('CombatDeploymentView.jsx');
    expect(source).toContain('Arrastra, coloca y confirma.');
    expect(source).toContain('Un peón metamorfoseado sigue ocupando un slot de peón.');
    expect(source).not.toContain('La identidad no cambia: un peón que combate como caballo');
  });

  it('deployment arrastra sólo una pieza, marca el destino y no oculta bajas pendientes', () => {
    const source = read('CombatDeploymentView.jsx');
    expect(source).toContain('deployment-drag-ghost');
    expect(source).toContain('deployment-square-drop-hover');
    expect(source).toContain('summary.fallenCount');
    expect(source).toContain('BAJAS PENDIENTES');
    expect(source).toContain('Nuevo recluta');
    expect(source).toContain('onRevive?.(unitKey, origin)');
    expect(source).toContain('onSquareDragLeave={handleSquareDragLeave}');
  });

  it('deployment muestra reserva y desplegados simultáneamente, sin tabs de estado', () => {
    const source = read('CombatDeploymentView.jsx');
    expect(source).toContain('aria-label="Unidades en reserva"');
    expect(source).toContain('aria-label="Unidades desplegadas"');
    expect(source).toContain('Banquillo · {summary.reserveCount}');
    expect(source).toContain('{summary.assignedCount}/{summary.totalSlots}');
    expect(source).toContain('deployment-right-rail');
    expect(source).not.toContain('setStatusFilter');
    expect(source).not.toContain('aria-label="Vista del roster"');
  });

  it('deployment permite inspeccionar bajas antes de decidir revivir o reemplazar', () => {
    const source = read('CombatDeploymentView.jsx');
    expect(source).toContain('Ver expediente antes de decidir si revivir');
    expect(source).toContain('onClick={() => inspectUnit(unitKey)}');
    expect(source).toContain('Decisión de recuperación');
    expect(source).toContain('puntos invertidos');
    expect(source).toContain('selectedService.survivals');
    expect(source).toContain('selectedMedals.map');
    expect(source).toContain('selectedTechniques.map');
    expect(source).toContain('Revivir cuesta');
    expect(source).toContain('Nuevo recluta archiva esta identidad');
  });

});
