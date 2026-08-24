import { describe, expect, it } from 'vitest';
import {
  buildCombatBriefingDossier,
  buildCombatDebriefDossier,
  buildObservabilitySummaryDossier,
  buildPostGameAutopsyDossier,
} from './aiNarrativeTasks.js';

describe('AI narrative task dossiers', () => {
  it('post-game sends only compact analysis facts, never raw history/FEN', () => {
    const dossier = buildPostGameAutopsyDossier({
      analyzedCount: 12,
      averageLoss: 84,
      worst: { moveNumber: 18, played: 'Qh5', suggested: 'Re1', loss: 430, severity: 'blunder', playedPiece: 'q', suggestedPiece: 'r', fen: 'SECRET_FEN' },
      topMistakes: [{ moveNumber: 18, played: 'Qh5', suggested: 'Re1', loss: 430, severity: 'blunder', playedPiece: 'q', suggestedPiece: 'r', context: { fen: 'NO' } }],
    }, { outcome: 'loss', opening: 'Apertura Réti', mode: 'casual' });
    expect(dossier.eventType).toBe('post_game_autopsy');
    expect(dossier.facts.worst_move).toEqual({ move_number: 18, played: 'Qh5', suggested: 'Re1', loss_cp: 430, severity: 'blunder', played_piece: 'q', suggested_piece: 'r' });
    expect(JSON.stringify(dossier)).not.toContain('SECRET_FEN');
    expect(JSON.stringify(dossier)).not.toContain('context');
  });

  it('combat briefing carries only known intel and deployment counts', () => {
    const dossier = buildCombatBriefingDossier({
      campaign: { operationalCredits: 22 },
      node: { stage: 4, label: 'Puente roto' },
      intel: { threatBand: 'Alta', threatRange: '50–60', levelLabel: 'Táctica', modifierLabel: 'Niebla', modifierDescription: 'Visibilidad limitada', bossHp: 4 },
      armySummary: { assignedCount: 12, totalSlots: 16 },
    });
    expect(dossier.facts).toMatchObject({ sector: 4, threat_band: 'Alta', boss_hp: 4, army_assigned: 12, army_slots: 16 });
  });

  it('combat debrief keeps notable units and bounded casualties', () => {
    const dossier = buildCombatDebriefDossier({
      outcome: 'win', totalKills: 7, totalBossDamage: 3, boardDeployedCount: 16, boardSurvivorCount: 13,
      topUnits: [{ alias: 'Rivas', originType: 'n', kills: 3, bossDamage: 2, promoted: true, afterRank: 'Capitán', survived: true }],
      units: Array.from({ length: 9 }, (_, index) => ({ alias: `Caído ${index}`, fallen: true })),
    });
    expect(dossier.facts.notable_units[0].alias).toBe('Rivas');
    expect(dossier.facts.fallen_aliases).toHaveLength(6);
  });

  it('observability summary is aggregated and does not include users or request bodies', () => {
    const dossier = buildObservabilitySummaryDossier({
      runtime: {
        history: { http: { samples: 900, p95_ms: 220, status_5xx: 2, top_routes: [{ route: 'GET /api/profile', requests: 200, p95_ms: 80 }] }, ai: { samples: 12, cloudflare_percent: 91.7, fallback_percent: 8.3, reasons: { timeout: 1 } } },
        database: { status: 'ok', latency_ms: 18 },
        users: [{ username: 'NOPE' }],
      },
      ai: { circuit: { open: false, consecutiveFailures: 0 } },
      rangeLabel: '7 días',
    });
    expect(dossier.eventType).toBe('observability_summary');
    expect(dossier.facts.api_p95_ms).toBe(220);
    expect(JSON.stringify(dossier)).not.toContain('NOPE');
  });
});
