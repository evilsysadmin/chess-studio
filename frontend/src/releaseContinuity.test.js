import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { APP_RELEASE } from './release.js';

function read(relative) {
  return fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');
}

const army = read('src/components/ArmyScreen.jsx');
const service = read('src/components/CombatServicePanel.jsx');
const campaign = read('src/components/RoguelikeScreen.jsx');
const styles = read('src/styles.css');
const profileKeys = read('src/profileKeys.js');
const invariants = read('src/stateInvariants.test.js');
const glossary = read('src/components/GlossaryTerm.jsx');
const admin = read('src/components/AdminScreen.jsx');
const menu = read('src/components/Menu.jsx');
const makefile = read('../Makefile');
const trivyInstaller = read('../scripts/install_trivy.sh');

// Gate de continuidad: no pretende duplicar todos los tests funcionales.
// Protege explícitamente las piezas que ya sufrimos que podían desaparecer al
// preparar una release desde un baseline viejo.
describe('continuidad acumulativa de release', () => {
  it('identifica inequívocamente la release desplegada', () => {
    expect(APP_RELEASE).toBe('v16.6bk');
    expect(admin).toContain("import { APP_RELEASE } from '../release.js';");
    expect(admin).toContain('Release: <code>{APP_RELEASE}</code>');
  });

  it('conserva el roster legible de 16 unidades en 6+6+4', () => {
    expect(army).toContain('visibleSlots.map');
    expect(army).toContain('16 unidades');
    expect(army).toContain('title={alias}');
    expect(army).toContain('Vista táctica en tres filas');
    expect(army).not.toContain('Expediente →');
    expect(styles).toContain('grid-template-columns: repeat(6, minmax(0, 1fr));');
    expect(styles).toContain('.army-roster-grid > :nth-child(13) { grid-column: 2; }');
    expect(styles).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });

  it('conserva la separación entre carrera global y unidades individuales', () => {
    expect(service).toContain('Rango global de campaña');
    expect(service).toContain('no corresponde a ninguna unidad');
    expect(campaign).toContain('<ArmyRosterPanel');
    expect(campaign).toContain('embedded');
  });

  it('conserva campaña persistente y glosario contextual', () => {
    expect(profileKeys).toContain("'chess-study-combat-campaign-v1'");
    expect(profileKeys).toContain("'chess-study-combat-campaign-best-stage'");
    expect(profileKeys).toContain("'chess-study-zen-mode'");
    expect(glossary).toContain('glossary-term');
  });

  it('conserva actividad admin, orden jerárquico y rename de unidades', () => {
    expect(army).toContain("useState('rank')");
    expect(army).toContain("setRosterOrder('formation')");
    expect(army).toContain('Alias de unidad');
    expect(admin).toContain('admin-current-activity');
  });

  it('conserva tarjetas de Historial/Admin y Trivy fijado con Dockerfiles explícitos', () => {
    expect(menu).toContain('<h3>Historial de partidas</h3>');
    expect(menu).toContain('<strong>Admin Panel</strong>');
    expect(menu).toContain('{isAdminUser && (');
    expect(makefile).toContain('TRIVY_VERSION := 0.74.0');
    expect(makefile).toContain('security-dockerfiles: ensure-trivy');
    expect(trivyInstaller).toContain('VERSION="0.74.0"');
  });

  it('conserva el presupuesto específico del fuzz de posiciones', () => {
    expect(invariants).toContain('LEGAL_POSITION_FUZZ_TIMEOUT_MS = 20_000');
    expect(invariants).toContain('}, LEGAL_POSITION_FUZZ_TIMEOUT_MS);');
    expect(invariants).toContain('for (let seed = 1; seed <= 32; seed += 1)');
  });
});
