import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  MECHANIC_TUTORIALS,
  loadMechanicTutorialProgress,
  markMechanicTutorialSeen,
} from './mechanicTutorials.js';

beforeEach(() => localStorage.clear());

describe('tutoriales de mecánicas no estándar', () => {
  it('cada tutorial tiene id único y al menos dos pasos útiles', () => {
    const ids = MECHANIC_TUTORIALS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MECHANIC_TUTORIALS.every((item) => item.title && item.summary && item.steps.length >= 2)).toBe(true);
  });

  it('persiste qué tutoriales ya vio el jugador', () => {
    expect(loadMechanicTutorialProgress()).toEqual({});
    const next = markMechanicTutorialSeen('combat-deployment');
    expect(next['combat-deployment'].seen).toBe(true);
    expect(loadMechanicTutorialProgress()['combat-deployment'].seen).toBe(true);
  });
  it('mantiene ayuda contextual en todas las superficies no estándar actuales', () => {
    const surfaces = {
      'combat-basics': 'src/components/CombatSetupView.jsx',
      'combat-deployment': 'src/components/CombatDeploymentView.jsx',
      'combat-metamorphosis': 'src/components/ArmyScreen.jsx',
      'combat-campaign': 'src/components/RoguelikeScreen.jsx',
      'combat-intelligence': 'src/components/CampaignBriefing.jsx',
      tournament: 'src/components/TournamentScreen.jsx',
      'quick-match-rules': 'src/components/QuickMatchModal.jsx',
      puzzles: 'src/components/PuzzleScreen.jsx',
      'rival-ghost': 'src/components/MirrorModeModal.jsx',
      insights: 'src/components/InsightsScreen.jsx',
      lab: 'src/components/LabScreen.jsx',
      spectator: 'src/components/SpectatorScreen.jsx',
    };
    for (const [tutorialId, relative] of Object.entries(surfaces)) {
      const source = fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');
      expect(source, `${tutorialId} sin ayuda contextual en ${relative}`).toContain(`tutorialId="${tutorialId}"`);
    }
  });

});
