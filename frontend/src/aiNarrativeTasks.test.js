import { describe, expect, it } from 'vitest';
import {
  buildCombatBriefingDossier,
  buildCombatDebriefDossier,
  buildMatthiasPositionDossier,
  buildObservabilitySummaryDossier,
  buildPostGameAutopsyDossier,
  buildTrainingPlanDossier,
  buildUnitBioDossier,
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

  it('Matthias position sends engine-grounded move facts and bounded FEN', () => {
    const dossier = buildMatthiasPositionDossier({
      moveNumber: 17, played: 'Qh5', suggested: 'Re1', loss: 430, severity: 'blunder',
      playedPiece: 'q', suggestedPiece: 'r', playedPerspectiveEval: -3.2, suggestedPerspectiveEval: 1.1,
      context: { fenBefore: '8/8/8/8/8/8/4K3/4k3 w - - 0 1', punisher: 'peón ataca dama' },
    }, { opening: 'Apertura Réti' });
    expect(dossier).toMatchObject({ eventType: 'matthias_position', requestKind: 'matthias_position' });
    expect(dossier.facts).toMatchObject({ played: 'Qh5', suggested: 'Re1', loss_cp: 430, opening: 'Apertura Réti' });
    expect(JSON.stringify(dossier)).not.toMatch(/username|email|token/i);
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

  it('training plan contains only deterministic coaching priorities and matching-position counts', () => {
    const dossier = buildTrainingPlanDossier({
      insights: { totalGames: 12 },
      coaching: [
        { priority: 'high', priorityLabel: 'Prioridad alta', title: 'Revisa tus mates', diagnosis: 'Has dejado pasar mates medidos.', action: 'Haz 5 posiciones de mate.' },
        { priority: 'medium', priorityLabel: 'Prioridad media', title: 'Menos damas al matadero', diagnosis: 'La dama quedó expuesta a peón.', action: 'Comprueba ataques de peón antes de moverla.' },
      ],
      trainingTargets: [{ count: 3, source: 'personal', filter: { incident: 'MISSED_MATE' } }, { count: 1 }],
    });
    expect(dossier).toMatchObject({ eventType: 'training_plan', requestKind: 'training_plan' });
    expect(dossier.facts.sample_band).toBe('10-19');
    expect(dossier.facts.priorities[0]).toMatchObject({ title: 'Revisa tus mates', matching_training_positions: 3 });
    expect(JSON.stringify(dossier)).not.toMatch(/MISSED_MATE|source|filter|username|fen|token/i);
  });

  it('unit bio uses a persistent identity seed without leaking account or game history', () => {
    const dossier = buildUnitBioDossier({
      identity: { identityId: 'unit-unique-123', alias: 'Rivas' },
      unitKey: 'n-merc-123',
      piece: { strengthPoints: 2, speedPoints: 1, mercenary: { rarity: 'regular' } },
      existingBios: ['Salcedo creció cerca del puerto y evita las ceremonias.'],
    });
    expect(dossier).toMatchObject({ eventType: 'unit_bio', requestKind: 'unit_bio', facts: { identity_seed: 'unit-unique-123', alias: 'Rivas', origin_type: 'n', level: 4, mercenary: true } });
    expect(JSON.stringify(dossier)).not.toMatch(/username|email|token|history|fen/i);
  });

  it('observability summary is aggregated and does not include users or request bodies', () => {
    const dossier = buildObservabilitySummaryDossier({
      runtime: {
        history: { http: { samples: 900, p95_ms: 220, status_5xx: 2, top_routes: [{ route: 'GET /api/profile', requests: 200, errors_5xx: 0, p95_ms: 80 }, { route: 'POST /api/narrative', requests: 70, errors_5xx: 0, p95_ms: 2500 }] }, ai: { samples: 12, cloudflare_percent: 91.7, fallback_percent: 8.3, reasons: { ok: 11, timeout: 1 } } },
        database: { status: 'ok', latency_ms: 18 },
        users: [{ username: 'NOPE' }],
      },
      ai: { circuit: { open: false, consecutiveFailures: 0 } },
      rangeLabel: '7 días',
    });
    expect(dossier.eventType).toBe('observability_summary');
    expect(dossier.facts.api_p95_ms).toBe(220);
    expect(dossier.facts.api_sample_quality).toBe('enough');
    expect(dossier.facts.ai_sample_quality).toBe('enough');
    expect(dossier.facts.top_ai_fallbacks).toEqual([{ reason: 'timeout', count: 1 }]);
    expect(dossier.facts.narrative_route).toMatchObject({ route: 'POST /api/narrative', errors_5xx: 0, p95_ms: 2500, latency_class: 'external_ai', interactive_comment_timeout_ms: 2000, rich_analysis_timeout_ms: 5000 });
    expect(dossier.facts.top_routes[0]).toHaveProperty('errors_5xx');
    expect(dossier.facts.error_routes).toEqual([]);
    expect(dossier.facts.slow_standard_routes[0]).toMatchObject({ route: 'GET /api/profile', p95_ms: 80 });
    expect(JSON.stringify(dossier)).not.toContain('NOPE');
  });
  it('does not overstate tiny observability samples', () => {
    const dossier = buildObservabilitySummaryDossier({ runtime: { history: { http: { samples: 3 }, ai: { samples: 1 } } } });
    expect(dossier.facts.api_sample_quality).toBe('low');
    expect(dossier.facts.ai_sample_quality).toBe('low');
  });
});
