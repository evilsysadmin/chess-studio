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
    expect(army).toContain('CANONICAL_ROSTER_SLOTS.map');
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

  it('conserva el presupuesto específico del fuzz de posiciones', () => {
    expect(invariants).toContain('LEGAL_POSITION_FUZZ_TIMEOUT_MS = 20_000');
    expect(invariants).toContain('}, LEGAL_POSITION_FUZZ_TIMEOUT_MS);');
    expect(invariants).toContain('for (let seed = 1; seed <= 32; seed += 1)');
  });
  it('conserva snapshot efímero y reanudación de Combat Chess tras reload', () => {
    const session = read('src/combatSession.js');
    const controller = read('src/components/useCombatController.js');
    const roguelike = read('src/components/RoguelikeScreen.jsx');
    expect(session).toContain('chess-study-active-combat-session-v1');
    expect(controller).toContain('loadCombatSession(combatSessionId)');
    expect(controller).toContain('saveCombatSession(combatSessionId');
    expect(controller).toContain('clearCombatSession(combatSessionId)');
    expect(roguelike).toContain('hasCombatSession(`campaign:${campaign.seed}:${campaign.selectedNodeId}`)');
  });

});
