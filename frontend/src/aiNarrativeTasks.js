function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value, max = 120) {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function compactMistake(move) {
  if (!move) return null;
  return {
    move_number: finiteNumber(move.moveNumber),
    played: cleanText(move.played, 24),
    suggested: cleanText(move.suggested, 24),
    loss_cp: finiteNumber(move.loss, 0),
    severity: cleanText(move.severity, 24),
    played_piece: cleanText(move.playedPiece, 8),
    suggested_piece: cleanText(move.suggestedPiece, 8),
  };
}

export function buildPostGameAutopsyDossier(report, meta = {}) {
  if (!report || finiteNumber(report.analyzedCount, 0) <= 0) return null;
  const topMistakes = (report.topMistakes || []).slice(0, 3).map(compactMistake).filter(Boolean);
  return {
    eventType: 'post_game_autopsy',
    requestKind: 'post_game',
    tone: 'friendly_sarcastic',
    facts: {
      outcome: cleanText(meta.outcome, 24),
      mode: cleanText(meta.mode, 32),
      opening: cleanText(meta.opening, 100),
      difficulty: finiteNumber(meta.difficulty),
      accuracy_percent: finiteNumber(meta.accuracy),
      average_loss_cp: finiteNumber(report.averageLoss, 0),
      analyzed_moves: finiteNumber(report.analyzedCount, 0),
      worst_move: compactMistake(report.worst),
      top_mistakes: topMistakes,
      pressure_moves: finiteNumber(meta.pressureMoves),
      pressure_incidents: finiteNumber(meta.pressureIncidents),
    },
  };
}

export function buildCombatBriefingDossier({ campaign, node, intel, armySummary } = {}) {
  if (!node || !intel) return null;
  return {
    eventType: 'combat_briefing',
    requestKind: 'combat_briefing',
    tone: 'friendly_sarcastic',
    facts: {
      sector: finiteNumber(node.stage),
      sector_label: cleanText(node.label, 80),
      threat_band: cleanText(intel.threatBand, 48),
      threat_range: cleanText(intel.threatRange, 48),
      intel_level: cleanText(intel.levelLabel, 48),
      exact_cpu: finiteNumber(intel.exactDifficulty),
      modifier: cleanText(intel.modifierLabel, 80),
      modifier_description: cleanText(intel.modifierDescription, 180),
      boss_hp: finiteNumber(intel.bossHp),
      operational_credits: finiteNumber(campaign?.operationalCredits, 0),
      army_assigned: finiteNumber(armySummary?.assignedCount),
      army_slots: finiteNumber(armySummary?.totalSlots),
    },
  };
}

export function buildCombatDebriefDossier(debrief) {
  if (!debrief) return null;
  const notable = (debrief.topUnits || []).slice(0, 3).map((unit) => ({
    alias: cleanText(unit.alias, 48),
    piece: cleanText(unit.originType, 8),
    kills: finiteNumber(unit.kills, 0),
    boss_damage: finiteNumber(unit.bossDamage, 0),
    promoted: Boolean(unit.promoted),
    after_rank: cleanText(unit.afterRank, 48),
    survived: Boolean(unit.survived),
  }));
  const fallen = (debrief.units || []).filter((unit) => unit?.fallen).slice(0, 6).map((unit) => cleanText(unit.alias, 48)).filter(Boolean);
  return {
    eventType: 'combat_debrief',
    requestKind: 'combat_debrief',
    tone: 'friendly_sarcastic',
    facts: {
      outcome: cleanText(debrief.outcome, 24),
      deployed: finiteNumber(debrief.boardDeployedCount ?? debrief.deployedCount, 0),
      survivors: finiteNumber(debrief.boardSurvivorCount ?? debrief.survivorCount, 0),
      enemy_kills: finiteNumber(debrief.totalKills, 0),
      boss_damage: finiteNumber(debrief.totalBossDamage, 0),
      combat_xp: finiteNumber(debrief.combatXpGained, 0),
      merit: finiteNumber(debrief.meritGained, 0),
      notable_units: notable,
      fallen_aliases: fallen,
      new_decorations: (debrief.newDecorations || []).slice(0, 4).map((item) => cleanText(item?.label, 64)).filter(Boolean),
    },
  };
}

export function buildObservabilitySummaryDossier({ runtime, ai, rangeLabel = 'rango actual' } = {}) {
  const http = runtime?.history?.http || {};
  const historicalAi = runtime?.history?.ai || {};
  const database = runtime?.database || {};
  const topRoutes = (http.top_routes || []).slice(0, 4).map((row) => ({
    route: cleanText(row.route, 120),
    requests: finiteNumber(row.requests, 0),
    p95_ms: finiteNumber(row.p95_ms),
  }));
  const topFallbacks = Object.entries(historicalAi.reasons || {})
    .filter(([reason]) => String(reason).toLowerCase() !== 'ok')
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 4)
    .map(([reason, count]) => ({ reason: cleanText(reason, 80), count: finiteNumber(count, 0) }));

  return {
    eventType: 'observability_summary',
    requestKind: 'observability_summary',
    tone: 'friendly_sarcastic',
    facts: {
      range: cleanText(rangeLabel, 48),
      api_requests: finiteNumber(http.samples, 0),
      api_sample_quality: finiteNumber(http.samples, 0) >= 20 ? 'enough' : 'low',
      api_requests_per_minute: finiteNumber(http.requests_per_minute, 0),
      api_p50_ms: finiteNumber(http.p50_ms),
      api_p95_ms: finiteNumber(http.p95_ms),
      api_p99_ms: finiteNumber(http.p99_ms),
      api_4xx: finiteNumber(http.status_4xx, 0),
      api_5xx: finiteNumber(http.status_5xx, 0),
      api_5xx_percent: finiteNumber(http.error_5xx_percent, 0),
      database_status: cleanText(database.status, 24),
      database_latency_ms: finiteNumber(database.latency_ms),
      ai_samples: finiteNumber(historicalAi.samples, 0),
      ai_sample_quality: finiteNumber(historicalAi.samples, 0) >= 5 ? 'enough' : 'low',
      ai_cloudflare_percent: finiteNumber(historicalAi.cloudflare_percent, 0),
      ai_fallback_percent: finiteNumber(historicalAi.fallback_percent, 0),
      ai_p95_ms: finiteNumber(historicalAi.p95_ms),
      ai_circuit_open: Boolean(ai?.circuit?.open),
      ai_consecutive_failures: finiteNumber(ai?.circuit?.consecutiveFailures, 0),
      top_routes: topRoutes,
      top_ai_fallbacks: topFallbacks,
    },
  };
}
