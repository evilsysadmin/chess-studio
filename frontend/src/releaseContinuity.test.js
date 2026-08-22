// STATIC CONTRACT: inspecciona wiring/markup/CSS deliberadamente; no sustituye tests de comportamiento.
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
const releaseManifest = read('../RELEASE.txt').trim();
const releaseFromManifest = releaseManifest.match(/v\d+\.\d+[a-z0-9.]*/i)?.[0] || null;

// Gate de continuidad: no pretende duplicar todos los tests funcionales.
// Protege explícitamente las piezas que ya sufrimos que podían desaparecer al
// preparar una release desde un baseline viejo.
describe('continuidad acumulativa de release', () => {
  it('identifica inequívocamente la release desplegada', () => {
    expect(APP_RELEASE).toMatch(/^v\d+\.\d+[a-z0-9.]*$/i);
    expect(releaseFromManifest).toBe(APP_RELEASE);
    expect(admin).toContain("import { APP_RELEASE } from '../release.js';");
    expect(admin).toContain('Release: <code>{APP_RELEASE}</code>');
  });

  it('conserva los 16 puestos canónicos legibles y permite barracón ampliado', () => {
    expect(army).toContain('CANONICAL_ROSTER_SLOTS.map');
    expect(army).toContain('deploy.totalRoster');
    expect(army).toContain('deploy.reserveCount');
    expect(army).toContain('aria-label={`Abrir expediente de ${alias}`}');
    expect(army).not.toContain('Expediente →');
    expect(styles).toContain('grid-template-columns: repeat(6, minmax(0, 1fr));');
    expect(styles).toContain('.army-roster-grid > :nth-child(13) { grid-column: 2; }');
    expect(styles).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });


  it('conserva mesa de guerra, slots por origen y reservas fuera de amenaza', () => {
    const deployment = read('src/combatDeployment.js');
    const deploymentView = read('src/components/CombatDeploymentView.jsx');
    const balance = read('src/combatBalance.js');
    expect(deploymentView).toContain('<Board');
    expect(deploymentView).toContain('deploymentSummary(roster)');
    expect(deployment).toContain('return originType === slot.type');
    expect(deployment).toContain('grantReserveRecruit');
    expect(balance).toContain('export function combatArmyThreat');
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
    expect(profileKeys).toContain("'chess-study-combat-operation-archive-v1'");
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

  it('conserva cierre de backlog UX y actividad admin gruesa', () => {
    const menu = read('src/components/Menu.jsx');
    const roster = read('src/combatRoster.js');
    const army = read('src/components/ArmyScreen.jsx');
    const app = read('src/App.jsx');
    expect(menu).toContain('onClick={onHistory}');
    expect(menu).toContain('{isAdminUser && (');
    expect(menu).toContain('onClick={onAdmin}');
    expect(roster).toContain('export function renameRosterIdentity');
    expect(army).toContain('Renombrar unidad');
    expect(app).toContain('ESC o clic derecho · volver / cerrar');
    expect(app).toContain("combat: 'Combat Chess'");
  });


  it('conserva XCOM-lite, Deployment 2.0 y tutoriales no estándar', () => {
    const campaignCore = read('src/combatCampaign.js');
    const deploymentView = read('src/components/CombatDeploymentView.jsx');
    const tutorials = read('src/mechanicTutorials.js');
    const learning = read('src/components/Tutorial.jsx');
    expect(campaignCore).toContain('operationalCredits');
    expect(campaignCore).toContain('purchaseCampaignIntel');
    expect(campaignCore).toContain("phase: 'battle'");
    expect(deploymentView).toContain('onAutoFill?.(true)');
    expect(deploymentView).toContain('aria-label="Buscar unidad"');
    expect(tutorials).toContain("id: 'combat-intelligence'");
    expect(army).toContain('tutorialId="combat-metamorphosis"');
    expect(learning).toContain('Modos especiales');
    expect(profileKeys).toContain("'chess-study-mechanic-tutorial-progress-v1'");
  });

  it('conserva el feature-freeze y el guard de compra de intel prebatalla', () => {
    const campaignCore = read('src/combatCampaign.js');
    const freeze = read('src/combatFreeze.test.js');
    expect(campaignCore).toContain("state.phase !== 'briefing'");
    expect(campaignCore).toContain('nodeId !== state.selectedNodeId');
    expect(freeze).toContain('feature-freeze invariants');
  });


  it('conserva visualizaciones medidas, Daily vivo, replay crítico y grada escasa', () => {
    const careerVisuals = read('src/careerVisuals.js');
    const daily = read('src/dailyChallenge.js');
    const replay = read('src/components/ReplayScreen.jsx');
    const spectator = read('src/spectatorReactions.js');
    const game = read('src/components/GameScreen.jsx');
    expect(careerVisuals).toContain('buildCareerHeatmaps');
    expect(careerVisuals).toContain('deriveRpgProfile');
    expect(daily).toContain('activeStreakFromDates');
    expect(replay).toContain('const [movieSpeed, setMovieSpeed]');
    expect(replay).toContain('criticalMoments');
    expect(spectator).toContain("mode = 'silence'");
    expect(game).toContain("import { noteworthyPresentation } from '../spectatorReactions.js';");
  });

});
