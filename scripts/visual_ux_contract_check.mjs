#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const entry = read('frontend/src/styles.css').trim().split(/\r?\n/);
const contractImport = "@import './styles/28-product-resilience.css';";
const contractCss = read('frontend/src/styles/28-product-resilience.css');
const viewportCss = contractCss;
const onboardingCss = contractCss;
const finalCss = contractCss;
const game = read('frontend/src/components/GameScreen.jsx');
const puzzle = read('frontend/src/components/PuzzleScreen.jsx');
const app = read('frontend/src/App.jsx');
const adminInbox = read('frontend/src/useAdminFeedbackInbox.js');
const chat = read('frontend/src/components/GameChat.jsx');
const menu = read('frontend/src/components/Menu.jsx');
const feedbackE2e = read('e2e/feedback-critical.spec.js');
const smoke = read('e2e/smoke.spec.js');

const checks = [
  [entry.at(-1) === contractImport, 'el contrato de producto debe ser el último CSS importado'],
  [/calc\(100dvh - 15\.6rem\)/.test(viewportCss), 'partida desktop debe reservar chrome vertical real'],
  [/calc\(100dvh - 17\.5rem\)/.test(viewportCss), 'portátiles de 720–780px deben reservar también Opciones avanzadas tras la primera jugada'],
  [/\.game-screen \.game-controls\s*\{[\s\S]*?position:\s*static;/.test(viewportCss), 'controles desktop no deben flotar sobre el tablero'],
  [/game-command-deck/.test(game) && /\.game-screen \.game-command-deck/.test(finalCss), 'estado, acciones y opciones avanzadas deben compartir una mesa de mando'],
  [/game-controls-actions/.test(game) && /\.game-screen \.game-controls-actions/.test(finalCss), 'la botonera debe tener un contenedor geométrico explícito'],
  [/\.game-screen \.game-controls-actions > \.zen-mode-toggle/.test(onboardingCss) && /\.game-screen \.game-controls-actions > \.game-abandon-btn/.test(onboardingCss), 'Zen y abandonar deben conservar la misma familia visual tras el wrapper'],
  [/game-advanced-tools[\s\S]*border-top/.test(finalCss), 'Opciones avanzadas debe integrarse con la mesa de mando'],
  [/home-onboarding-target/.test(onboardingCss) && /home-onboarding-cue/.test(onboardingCss), 'el onboarding debe señalar visualmente el siguiente objetivo'],
  [/home-onboarding-tip/.test(finalCss), 'el onboarding debe poder explicar Retos sin modal extra'],
  [/\.combat-battle-screen[\s\S]*?calc\(100dvh - 14\.5rem\)/.test(viewportCss), 'Combat debe presupuestar HUD y controles en altura'],
  [/--campaign-map-art/.test(read('frontend/src/components/CombatCampaignMap.jsx')) && /campaign-map-art/.test(finalCss), 'el mapa debe conservar el fondo artístico de campaña'],
  [/9\.375%[\s\S]*11\.607%/.test(finalCss), 'BASE/BOSS deben usar márgenes horizontales seguros'],
  [/\.home-footer-bar[\s\S]*grid-template-columns:[^;]*1fr[^;]*auto[^;]*1fr/.test(finalCss), 'los enlaces del footer deben quedar centrados independientemente del release'],
  [/desktop 1440x900 · Partida completa cabe en viewport/.test(smoke), 'falta regresión desktop 1440x900 de partida'],
  [/desktop 1366x768 · Partida compacta conserva tablero/.test(smoke), 'falta regresión portátil 1366x768 de partida'],
  [/desktop 1440x900 · Combat mantiene mesa y acciones coherentes/.test(smoke), 'falta regresión desktop de Combat'],
  [/Combat Chess · mapa conserva art y todos los nodos dentro del lienzo/.test(smoke), 'falta regresión visual del mapa de campaña'],
  [/Math\.max\(\.\.\.heights\) - Math\.min\(\.\.\.heights\)/.test(smoke), 'los E2E deben comprobar geometría coherente de botones'],
  [/Onboarding Home · el siguiente paso se señala/.test(smoke), 'falta E2E del recorrido visual de onboarding'],
  [/puzzle-training-workspace/.test(puzzle) && /puzzle-coach-panel/.test(puzzle) && /\.puzzle-training-workspace[\s\S]*grid-template-columns/.test(finalCss), 'Entrena tus errores debe usar tablero + coach lateral'],
  [/REPLAY \/\/ ANÁLISIS/.test(puzzle) && /puzzle-coach-solution/.test(puzzle), 'la explicación del replay debe vivir en el panel coach'],
  [/AdminFeedbackInboxButton/.test(app) && /fetchAdminFeedbackSummary/.test(adminInbox), 'Home admin debe avisar de feedback nuevo sin esconderlo en Mi cuenta'],
  [/\.admin-feedback-card\.status-resolved \{ opacity: 1; \}/.test(finalCss) && /admin-feedback-delete/.test(finalCss), 'las acciones de feedback resuelto deben seguir visibles'],
  [/CPU_IDENTITY/.test(game) && /game-player-avatar\$\{cpu \? ' has-portrait'/.test(game) && /matthias-cpu\.webp/.test(read('frontend/src/cpuIdentity.js')), 'Matthias debe ocupar el hueco de identidad existente en la tarjeta rival'],
  [/CPU_IDENTITY\.name\.toUpperCase\(\)/.test(chat) && /game-chat-matthias-avatar/.test(finalCss), 'el chat debe firmar como Matthias con presencia compacta'],
  [/MatthiasHomeVisit/.test(menu) && /matthias-home-visit/.test(finalCss), 'Home debe poder mostrar la visita ocasional de Matthias sin una nueva capa flotante'],
  [/resuelto mantiene Reabrir y Borrar feedback visibles/.test(feedbackE2e), 'falta E2E de borrado visible en feedback resuelto'],
  [/admin ve un sobre en Home cuando hay mensajes nuevos/.test(feedbackE2e), 'falta E2E del inbox admin de feedback'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('visual-ux-contract FAIL');
  for (const message of failed) console.error(` - ${message}`);
  process.exit(1);
}
console.log('visual-ux-contract OK · viewport + mesa de mando + mapa artístico + acciones + onboarding + Matthias + coach de replay + inbox admin protegidos');
