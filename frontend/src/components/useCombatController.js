import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { api } from '../api.js';
import { playMoveSound, playCaptureSound, playMissSound, playSuccessSound } from '../sound.js';
import {
  createInitialRegistry,
  resolveCombatMove,
  hitChance,
  isForcedCombatCapture,
  nextFocusTracker,
  capturedSquareFor,
  derivedLevel,
  buyStatPoint,
  autoLevelUp,
  repetitionKey,
  rosterKeyFor,
} from '../combat.js';
import { loadRoster, saveRoster, applyRosterToRegistry, saveSurvivorsToRoster, expireDeadPieces } from '../combatRoster.js';
import { saveCombatBattle } from '../combatHistory.js';
import { loadCombatService, recordCombatServiceEvent, summarizeCombatService } from '../combatService.js';
import { recordUnitBattle, unitDecorations, unitRecordForKey } from '../combatUnitService.js';
import {
  annotateRegistryWithDeployment,
  applyDeploymentToPosition,
  deploymentSummary,
  ensureDeploymentState,
  isDeploymentReadyForBattle,
  autofillDeployment,
} from '../combatDeployment.js';
import { techniqueTargetsFor, techniqueAttackChance, resolveTechniqueAttack, techniqueById } from '../combatTechniques.js';
import { checkAchievements } from '../achievements.js';
import { loadRating, ratingProgress, difficultyForRating } from '../playerRating.js';
import { applyRunPerksToRegistry } from '../roguelikePerks.js';
import { bossDamageAfterHumanMove, bossPhaseForHp } from '../roguelikeBoss.js';
import { balancedCombatDifficulty } from '../combatBalance.js';
import { canReturnCombatToSetup } from '../combatSession.js';
import { buildCombatDebrief } from '../combatDebrief.js';
import { STATUS_LABELS, CPU_DELAY_MS, resolveHumanColor, emptyUnitBattleStats, incrementIdentityCounter, buildCombatLogEntry, resolveCombatCpuTurnSuggestion } from '../combatControllerSupport.js';
import { createCombatRosterActions } from '../combatRosterActions.js';
import { awardCombatCredits, battleCreditReward, buyEquipment, combatCreditSignalForAttempt, hireMercenary, settleMercenaryContracts } from '../combatEconomy.js';
import { useCombatSessionBootstrap, useCombatSessionPersistence } from '../useCombatSessionPersistence.js';
import { useCombatDeploymentGate } from '../useCombatDeploymentGate.js';



export function useCombatController({ onExit, onError, onHistory, onViewBattle, onPersistenceState, initialFen, onBattleStart, onBattleResult, difficultyOverride, forcedHumanColor, combatVariant, runPerks = [], bossConfig = null, roguelikeFloor = null, roguelikeMode = null, combatSessionId = 'free', requireDeploymentConfirmation = false }) {
  const { restoredSession, activityGameIdRef } = useCombatSessionBootstrap(combatSessionId);
  const [phase, setPhase] = useState(restoredSession ? 'battle' : 'setup'); // 'setup' | 'battle' | 'over'
  // Registro jugada-a-jugada de ESTA batalla, para la "pista inversa" y el
  // historial de Combate. No es un historial SAN normal (los fallos/esquives
  // NO mueven la pieza, solo pasan el turno — eso rompe el supuesto de
  // "alternancia estricta blanco/negro" del que depende chess.js para
  // reproducir una partida jugada a jugada), así que se guarda el FEN
  // resultante de cada paso directamente, en vez de reconstruirlo después.
  const [combatLog, setCombatLog] = useState(() => restoredSession?.combatLog || []);
  const [battleRecap, setBattleRecap] = useState(null);
  // Dificultad automática, según "cómo te ve la CPU" (tu rating) — antes
  // era un slider que elegías tú mismo, sin relación con tu progreso
  // real. Se recalcula cada vez que se monta la pantalla (no es reactivo
  // a mitad de partida a propósito: el rival no debería cambiar de
  // fuerza mientras estás peleando).
  const rating = useMemo(() => loadRating(), []);
  const ratingInfo = useMemo(() => ratingProgress(rating.rating), [rating]);
  const baseDifficulty = useMemo(
    () => (difficultyOverride != null ? difficultyOverride : difficultyForRating(rating.rating)),
    [rating, difficultyOverride]
  );
  const [colorChoice, setColorChoice] = useState('random');
  const [autoLevelUpEnabled, setAutoLevelUpEnabled] = useState(() => restoredSession?.autoLevelUpEnabled !== false);
  const [humanColor, setHumanColor] = useState(() => restoredSession?.humanColor || 'w');

  const [fen, setFen] = useState(() => restoredSession?.fen || new Chess().fen());
  const [registry, setRegistry] = useState(() => restoredSession?.registry || createInitialRegistry(new Chess()));
  const [selected, setSelected] = useState(null);
  const [activeTechnique, setActiveTechnique] = useState(null); // { from, techniqueId } durante selección de objetivo
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [pendingAttack, setPendingAttack] = useState(null); // { from, to, promotion, attacker, defender, chance }
  const [infoSquare, setInfoSquare] = useState(null); // casilla inspeccionada (para poder refrescar tras comprar)
  const [busy, setBusy] = useState(false);
  const [pendingAnim, setPendingAnim] = useState(null);
  const [log, setLog] = useState(() => restoredSession?.uiLog || []);
  const uiLogRef = useRef(restoredSession?.uiLog || []);
  const [cpuRetryNeeded, setCpuRetryNeeded] = useState(false);
  const cpuRetryContextRef = useRef(null);
  const [roster, setRoster] = useState(() => loadRoster());
  const difficultyBalance = useMemo(() => balancedCombatDifficulty(baseDifficulty, roster), [baseDifficulty, roster]);
  const difficulty = difficultyBalance.adjusted;
  const [serviceRecord, setServiceRecord] = useState(() => loadCombatService());
  const [showArmy, setShowArmy] = useState(false);
  const [showMarket, setShowMarket] = useState(false);
  const deadRosterEntries = Object.entries(roster.pieces).filter(([, p]) => p.alive === false);
  const {
    showDeployment, setShowDeployment, deploymentConfirmed, setDeploymentConfirmed,
    handleStartBattleClick: runDeploymentStartGate,
    handleConfirmDeployment, guardBattleStart,
  } = useCombatDeploymentGate({
    requireDeploymentConfirmation,
    restoredSession,
    roster,
    deadCount: deadRosterEntries.length,
    onError,
  });
  // Un solo listener de ESC para la pantalla base. Deployment y Army traen
  // su propio cierre y consumen el gesto mientras están abiertos.
  useEscapeToClose(() => {
    if (showDeployment || showArmy || showMarket) return;
    if (phase === 'setup' || phase === 'over') {
      onExit();
    }
  });
  // Fuego concentrado: a quién le viene pegando cada bando (por id de la
  // pieza objetivo) y cuántos ataques consecutivos lleva contra ella.
  // Refs, no estado React: los turnos de CPU viajan por setTimeout y una
  // closure vieja no debe olvidar el fuego concentrado ni las repeticiones.
  const focusRef = useRef(restoredSession?.focus || { w: null, b: null }); // { targetId, streak } | null
  const positionCountsRef = useRef(new Map(restoredSession?.positionCounts || []));
  const [repetitionDraw, setRepetitionDraw] = useState(false);
  const animSeqRef = useRef(0);
  const bossHpRef = useRef(restoredSession?.bossHp ?? bossConfig?.maxHp ?? null);
  const [bossHp, setBossHp] = useState(restoredSession?.bossHp ?? bossConfig?.maxHp ?? null);
  const [bossPhase, setBossPhase] = useState(restoredSession?.bossPhase || 1);
  const battleStartRosterRef = useRef(restoredSession?.battleStartRoster || null);
  const battleParticipantsRef = useRef(restoredSession?.battleParticipants || []);
  const unitBattleStatsRef = useRef(restoredSession?.unitBattleStats || emptyUnitBattleStats());

  const localChess = useMemo(() => {
    const c = new Chess();
    c.load(fen);
    return c;
  }, [fen]);

  const { saveBattleSnapshot, persistBattleSession, clearBattleSession } = useCombatSessionPersistence({
    combatSessionId,
    onPersistenceState,
    restoredSession,
    activityGameIdRef,
    phase,
    fen,
    registry,
    humanColor,
    combatLog,
    uiLogRef,
    autoLevelUpEnabled,
    bossPhase,
    localChess,
    focusRef,
    positionCountsRef,
    bossHpRef,
    battleStartRosterRef,
    battleParticipantsRef,
    unitBattleStatsRef,
    setBusy,
    runCpuTurn,
  });

  const techniqueTargets = activeTechnique
    ? techniqueTargetsFor(fen, registry, activeTechnique.from)
    : [];
  const legalTargets = activeTechnique
    ? techniqueTargets.map((to) => ({ to, san: `†x${to}`, technique: true }))
    : selected
    ? localChess.moves({ square: selected, verbose: true }).map((m) => ({ to: m.to, san: m.san }))
    : [];

  const pieceLevels = useMemo(() => {
    const map = {};
    for (const [square, piece] of Object.entries(registry)) {
      const lvl = derivedLevel(piece);
      if (lvl > 1) map[square] = lvl;
    }
    return map;
  }, [registry]);

  const pieceXp = useMemo(() => {
    const map = {};
    for (const [square, piece] of Object.entries(registry)) {
      if (piece.bankedXp > 0) map[square] = piece.bankedXp;
    }
    return map;
  }, [registry]);

  // Resumen rápido de tu ejército en pie, sin tener que hacer doble clic
  // pieza por pieza — cuántas piezas tuyas siguen vivas, su nivel sumado, y
  // cuánto XP sin gastar hay dando vueltas entre todas.
  const armySummary = useMemo(() => {
    let aliveCount = 0;
    let totalLevel = 0;
    let totalXp = 0;
    for (const piece of Object.values(registry)) {
      if (piece.color !== humanColor) continue;
      aliveCount += 1;
      totalLevel += derivedLevel(piece);
      totalXp += piece.bankedXp || 0;
    }
    return { aliveCount, totalLevel, totalXp };
  }, [registry, humanColor]);

  const pieceVeteranMarks = useMemo(() => {
    const marks = {};
    for (const [square, piece] of Object.entries(registry || {})) {
      if (piece.color !== humanColor || piece.type === 'k') continue;
      const key = rosterKeyFor(piece);
      const record = unitRecordForKey(roster, key);
      const medals = unitDecorations(record);
      const unitMarks = [];
      if (medals.length > 0) unitMarks.push({ id: 'decorated', glyph: '✦', label: `${medals.length} condecoración${medals.length === 1 ? '' : 'es'}` });
      if (piece.equippedTechnique) {
        const technique = techniqueById(piece.equippedTechnique);
        unitMarks.push({ id: 'technique', glyph: '◆', label: technique ? `Técnica: ${technique.label}` : 'Técnica equipada' });
      }
      if ((record?.stats?.revives || 0) > 0) unitMarks.push({ id: 'revived', glyph: '↺', label: `Revivida ${record.stats.revives} vez${record.stats.revives === 1 ? '' : 'es'}` });
      if (unitMarks.length) marks[square] = unitMarks;
    }
    return marks;
  }, [registry, humanColor, roster]);

  const infoPiece = infoSquare ? registry[infoSquare] : null;
  const infoUnitRecord = infoPiece && infoPiece.color === humanColor && infoPiece.type !== 'k'
    ? unitRecordForKey(roster, rosterKeyFor(infoPiece))
    : null;
  const infoTechniqueTargets = infoSquare ? techniqueTargetsFor(fen, registry, infoSquare) : [];
  const serviceSummary = useMemo(() => summarizeCombatService(serviceRecord), [serviceRecord]);

  function handleStartBattleClick() {
    runDeploymentStartGate(startBattle);
  }

  function handleQuickStartBattle() {
    if (!requireDeploymentConfirmation) {
      handleStartBattleClick();
      return true;
    }
    if (deadRosterEntries.length > 0) {
      setShowDeployment(true);
      onError?.('Hay bajas pendientes. Decide si revivir o reemplazar antes de entrar en combate.');
      return false;
    }

    let candidate = roster;
    if (!isDeploymentReadyForBattle(candidate)) candidate = autofillDeployment(candidate, { preferVeterans: true });
    if (!isDeploymentReadyForBattle(candidate)) {
      setShowDeployment(true);
      onError?.('No se pudo completar una formación válida automáticamente. Revisa el despliegue.');
      return false;
    }

    if (candidate !== roster) {
      setRoster(candidate);
      saveRoster(candidate);
    }
    setDeploymentConfirmed(true);
    setShowDeployment(false);
    startBattle({ rosterOverride: candidate, deploymentValidated: true });
    return true;
  }

  function startBattle(options = {}) {
    const rosterOverride = options?.rosterOverride || null;
    const deploymentValidated = options?.deploymentValidated === true;
    if (!deploymentValidated && !guardBattleStart()) return;
    const resolved = forcedHumanColor || resolveHumanColor(colorChoice);

    // Se cierra acá la ventana de revivir: cualquier pieza que sigue caída
    // sin que la hayas recuperado pierde su veteranía a partir de ahora; el slot volverá como nivel 1.
    const sourceRoster = rosterOverride || roster;
    const activeRoster = ensureDeploymentState(expireDeadPieces(sourceRoster));
    if (activeRoster !== roster) {
      setRoster(activeRoster);
      saveRoster(activeRoster);
    }

    const deployment = deploymentSummary(activeRoster);
    if (!isDeploymentReadyForBattle(activeRoster)) {
      setShowDeployment(true);
      const detail = deployment.fallenCount > 0
        ? `resuelve ${deployment.fallenCount} baja${deployment.fallenCount === 1 ? '' : 's'} pendiente${deployment.fallenCount === 1 ? '' : 's'}`
        : `faltan ${deployment.missingSlots.map((slot) => slot.type.toUpperCase() + slot.file).join(', ')}`;
      onError?.(`Completa el despliegue antes de combatir: ${detail}.`);
      return;
    }

    const chess = new Chess();
    if (initialFen) chess.load(initialFen);
    applyDeploymentToPosition(chess, activeRoster, resolved);
    const baseRegistry = annotateRegistryWithDeployment(createInitialRegistry(chess), activeRoster, resolved);
    const startFen = chess.fen();
    const rosterRegistry = applyRosterToRegistry(baseRegistry, activeRoster, resolved);
    const initialRegistry = applyRunPerksToRegistry(rosterRegistry, runPerks, resolved);
    battleStartRosterRef.current = activeRoster;
    battleParticipantsRef.current = Object.values(initialRegistry)
      .filter((piece) => piece.color === resolved && piece.type !== 'k' && piece.identityId)
      .map((piece) => ({
        identityId: piece.identityId,
        alias: piece.alias || 'Sin alias',
        createdAt: piece.createdAt || null,
        slotKey: rosterKeyFor(piece),
      }));
    unitBattleStatsRef.current = emptyUnitBattleStats();
    if (bossConfig) {
      bossHpRef.current = bossConfig.maxHp;
      setBossHp(bossConfig.maxHp);
      setBossPhase(1);
    }

    setHumanColor(resolved);
    setCombatLog([]);
    setBattleRecap(null);
    setFen(startFen);
    setRegistry(initialRegistry);
    setSelected(null);
    setActiveTechnique(null);
    setPendingPromotion(null);
    setInfoSquare(null);
    setPendingAnim(null);
    uiLogRef.current = [];
    setLog([]);
    setCpuRetryNeeded(false);
    focusRef.current = { w: null, b: null };
    positionCountsRef.current = new Map([[repetitionKey(startFen), 1]]);
    setRepetitionDraw(false);
    const activityGameId = `${combatSessionId}:${Date.now()}`;
    activityGameIdRef.current = activityGameId;
    saveBattleSnapshot({
      phase: 'battle',
      fen: startFen,
      registry: initialRegistry,
      humanColor: resolved,
      combatLog: [],
      uiLog: [],
      autoLevelUpEnabled,
      focus: focusRef.current,
      positionCounts: [...positionCountsRef.current.entries()],
      bossHp: bossHpRef.current,
      bossPhase: bossConfig ? 1 : null,
      battleStartRoster: battleStartRosterRef.current,
      battleParticipants: battleParticipantsRef.current,
      unitBattleStats: unitBattleStatsRef.current,
      activityGameId,
    });
    setPhase('battle');
    onBattleStart?.({
      gameId: activityGameId,
      modeRecord: { variant: combatVariant || 'combat', roguelikeMode: combatVariant === 'roguelike' ? (roguelikeMode || 'tower') : null },
    });

    // Si te tocaron negras, las blancas (la CPU) mueven primero — sin esto
    // la partida se queda esperando para siempre a que "alguien" mueva.
    if (resolved === 'b') {
      setBusy(true);
      setTimeout(() => runCpuTurn(startFen, initialRegistry, resolved, []), CPU_DELAY_MS);
    } else {
      setBusy(false);
    }
  }

  function pushLog(entry) {
    if (!entry) return;
    const next = [entry, ...uiLogRef.current].slice(0, 8);
    uiLogRef.current = next;
    setLog(next);
  }

  // Cuántos ataques consecutivos ya lleva ESTE bando contra ESTE objetivo,
  // antes del ataque que se está por resolver.
  function currentFocusStreak(attackerColor, defenderId) {
    const f = focusRef.current[attackerColor];
    if (!f || f.targetId !== defenderId) return 0;
    return f.streak;
  }

  // Actualiza el fuego concentrado tras CUALQUIER acción. Una jugada no
  // capturadora rompe la racha; sólo los fallos seguidos contra la misma pieza
  // la incrementan. Se guarda en ref para que el callback de CPU programado
  // medio segundo antes vea el valor actual y no un closure viejo.
  function updateFocusAfterAction(result) {
    const attackerColor = result?.attacker?.color;
    if (!attackerColor) return;
    const defenderId = result?.defender?.id || null;
    const current = focusRef.current[attackerColor];
    focusRef.current = {
      ...focusRef.current,
      [attackerColor]: nextFocusTracker(current, {
        isCapture: result.isCapture,
        hit: result.hit,
        defenderId,
      }),
    };
  }

  function finalizeBattle(outcome, finalRegistry, updatedLog, currentHumanColor) {
    const isWin = outcome === 'win';
    if (isWin) playSuccessSound();

    let leveledRegistry = finalRegistry;
    if (autoLevelUpEnabled) {
      leveledRegistry = Object.fromEntries(
        Object.entries(finalRegistry).map(([sq, piece]) => {
          if (piece.color !== currentHumanColor) return [sq, piece];
          const strengthBonus = piece.equipmentStrengthBonus || 0;
          const speedBonus = piece.equipmentSpeedBonus || 0;
          const leveled = autoLevelUp({
            ...piece,
            strengthPoints: Math.max(0, (piece.strengthPoints || 0) - strengthBonus),
            speedPoints: Math.max(0, (piece.speedPoints || 0) - speedBonus),
          });
          return [sq, { ...leveled, strengthPoints: leveled.strengthPoints + strengthBonus, speedPoints: leveled.speedPoints + speedBonus }];
        })
      );
    }

    const battleId = `combat-${Date.now()}`;
    const battleDate = new Date().toISOString();

    // Los bonus del intento (`runStrengthBonus/runSpeedBonus`) no se guardan:
    // saveSurvivorsToRoster sólo persiste puntos comprados + XP bancado.
    const deployedKeys = (battleParticipantsRef.current || []).map((participant) => participant.slotKey).filter(Boolean);
    const rosterAfterSurvival = saveSurvivorsToRoster(leveledRegistry, roster, currentHumanColor, outcome, deployedKeys);
    const survivorIdentityIds = Object.values(finalRegistry)
      .filter((piece) => piece.color === currentHumanColor && piece.type !== 'k' && piece.identityId)
      .map((piece) => piece.identityId);
    const unitStats = unitBattleStatsRef.current || emptyUnitBattleStats();
    let nextRoster = recordUnitBattle(rosterAfterSurvival, {
      battleId,
      date: battleDate,
      outcome,
      participants: battleParticipantsRef.current,
      survivorIdentityIds,
      killsByIdentity: unitStats.killsByIdentity,
      bossDamageByIdentity: unitStats.bossDamageByIdentity,
      bossFinisherIdentityId: unitStats.bossFinisherIdentityId,
      bossDefeated: isWin && !!bossConfig,
    });
    const totalCaptures = Object.values(unitStats.killsByIdentity || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
    const deployedUnitCount = (battleParticipantsRef.current || []).filter((participant) => participant?.identityId).length;
    const casualties = Math.max(0, deployedUnitCount - survivorIdentityIds.length);
    const creditReward = battleCreditReward({
      outcome,
      captures: totalCaptures,
      floor: roguelikeFloor,
      encounterTier,
      variant: combatVariant || 'combat',
      casualties,
      deployed: deployedUnitCount,
      underdogCredits: unitStats.underdogCredits || 0,
      tacticalCredits: unitStats.tacticalCredits || 0,
    });
    nextRoster = awardCombatCredits(nextRoster, creditReward, battleId);
    const rosterForDebrief = nextRoster;
    const contractSettlement = settleMercenaryContracts(nextRoster, deployedKeys);
    nextRoster = contractSettlement.roster;
    saveRoster(nextRoster);
    setRoster(nextRoster);

    const survivorCount = Object.values(finalRegistry).filter((p) => p.color === currentHumanColor).length;
    const battleRecord = {
      id: battleId,
      date: battleDate,
      difficulty,
      baseDifficulty: difficultyBalance.base,
      armyThreatBonus: difficultyBalance.appliedBonus,
      humanColor: currentHumanColor,
      outcome,
      log: updatedLog,
      variant: combatVariant || 'combat',
      survivorCount,
      roguelikeFloor: combatVariant === 'roguelike' ? roguelikeFloor : null,
      roguelikeMode: combatVariant === 'roguelike' ? (roguelikeMode || 'tower') : null,
      boss: bossConfig ? { id: bossConfig.id, maxHp: bossConfig.maxHp, remainingHp: bossHpRef.current } : null,
    };

    // La hoja de servicio se actualiza ANTES de guardar la batalla en el historial.
    // Así una migración perezosa no puede "ver" esta batalla como legacy y tragarse
    // datos nuevos como supervivientes/piso antes de procesar el evento completo.
    const veteranPieces = Object.values(nextRoster.pieces).filter((piece) => piece?.alive !== false && ((piece?.strengthPoints || 0) + (piece?.speedPoints || 0)) >= 1).length;
    const elitePieces = Object.values(nextRoster.pieces).filter((piece) => piece?.alive !== false && (1 + (piece?.strengthPoints || 0) + (piece?.speedPoints || 0)) >= 6).length;
    const serviceResult = recordCombatServiceEvent({
      battleId: battleRecord.id,
      outcome,
      survivorCount,
      veteranPieces,
      elitePieces,
      variant: battleRecord.variant,
      roguelikeFloor: battleRecord.roguelikeFloor,
      roguelikeMode: battleRecord.roguelikeMode,
      bossDefeated: isWin && !!bossConfig,
    });
    setServiceRecord(serviceResult.record);
    saveCombatBattle(battleRecord);

    checkAchievements({ combatFlawlessWin: isWin && survivorCount === 16 });

    clearBattleSession();

    const debrief = buildCombatDebrief({
      outcome,
      beforeRoster: battleStartRosterRef.current || roster,
      afterRoster: rosterForDebrief,
      participants: battleParticipantsRef.current,
      survivorIdentityIds,
      killsByIdentity: unitStats.killsByIdentity,
      bossDamageByIdentity: unitStats.bossDamageByIdentity,
      battleRecord,
      serviceResult,
      creditsGained: creditReward.total,
      creditBreakdown: creditReward,
      contractsCompleted: contractSettlement.completed,
    });
    setBattleRecap({
      survivorCount,
      totalCount: 16,
      creditsGained: creditReward.total,
      record: battleRecord,
      serviceResult,
      debrief,
    });

    onBattleResult?.(outcome, debrief, {
      gameId: activityGameIdRef.current || battleRecord.id,
      battleRecord,
    });
    activityGameIdRef.current = null;
    setPhase('over');
  }

  function resetBossPhase(currentHumanColor, survivorRegistry) {
    const chess = new Chess();
    if (initialFen) chess.load(initialFen);
    const baseRoster = ensureDeploymentState(battleStartRosterRef.current || roster);
    applyDeploymentToPosition(chess, baseRoster, currentHumanColor);
    const phaseBaseRegistry = annotateRegistryWithDeployment(createInitialRegistry(chess), baseRoster, currentHumanColor);
    let fresh = applyRunPerksToRegistry(
      applyRosterToRegistry(phaseBaseRegistry, baseRoster, currentHumanColor),
      runPerks,
      currentHumanColor,
    );

    // El boss recompone SU posición entre fases, pero no resucita por cortesía
    // las piezas humanas que ya consiguió capturar. Mapeamos los supervivientes
    // por slot de roster (su `id` conserva la casilla/tipo de origen aunque la
    // pieza se haya movido) y llevamos sus stats/XP actuales a la nueva fase.
    const survivorsBySlot = new Map(
      Object.values(survivorRegistry || {})
        .filter((piece) => piece.color === currentHumanColor)
        .map((piece) => [rosterKeyFor(piece), piece]),
    );
    for (const [square, piece] of Object.entries({ ...fresh })) {
      if (piece.color !== currentHumanColor || piece.type === 'k') continue;
      const survivor = survivorsBySlot.get(rosterKeyFor(piece));
      if (!survivor) {
        chess.remove(square);
        delete fresh[square];
        continue;
      }
      fresh[square] = {
        ...piece,
        strengthPoints: survivor.strengthPoints || 0,
        speedPoints: survivor.speedPoints || 0,
        bankedXp: survivor.bankedXp || 0,
        runStrengthBonus: survivor.runStrengthBonus || piece.runStrengthBonus || 0,
        runSpeedBonus: survivor.runSpeedBonus || piece.runSpeedBonus || 0,
        deploymentType: survivor.deploymentType || piece.deploymentType || null,
        unlockedTechniques: Array.isArray(survivor.unlockedTechniques) ? [...survivor.unlockedTechniques] : (piece.unlockedTechniques || []),
        equippedTechnique: survivor.equippedTechnique || piece.equippedTechnique || null,
        techniqueUsed: !!survivor.techniqueUsed,
      };
    }

    const nextFen = chess.fen();
    setFen(nextFen);
    setRegistry(fresh);
    setSelected(null);
    setPendingAttack(null);
    setPendingPromotion(null);
    focusRef.current = { w: null, b: null };
    positionCountsRef.current = new Map([[repetitionKey(nextFen), 1]]);
    setRepetitionDraw(false);
    const restoredBossPhase = bossPhaseForHp(bossHpRef.current, bossConfig);
    setBossPhase(restoredBossPhase);
    pushLog({ text: `${bossConfig?.label || 'El Rey Viejo'} rompe la posición y abre una nueva fase · ${bossHpRef.current}/${bossConfig?.maxHp} HP · tus bajas se arrastran`, tone: 'bad', kind: 'boss' });
    saveBattleSnapshot({
      phase: 'battle',
      fen: nextFen,
      registry: fresh,
      humanColor: currentHumanColor,
      combatLog,
      uiLog: uiLogRef.current,
      autoLevelUpEnabled,
      focus: focusRef.current,
      positionCounts: [...positionCountsRef.current.entries()],
      bossHp: bossHpRef.current,
      bossPhase: restoredBossPhase,
      battleStartRoster: battleStartRosterRef.current,
      battleParticipants: battleParticipantsRef.current,
      unitBattleStats: unitBattleStatsRef.current,
      activityGameId: activityGameIdRef.current,
    });
    setBusy(false);
  }

  // Todo lo que necesita esta función viaja como parámetro explícito (fen,
  // registro, de qué color juega el humano) en vez de leerse del estado de
  // React — así nunca usa un valor "viejo" por un closure desactualizado,
  // ni siquiera cuando se llama desde dentro de un setTimeout.
  // combatLog viaja como parámetro explícito por la MISMA razón que fen,
  // registry y humanColor ya lo hacían (ver comentario arriba): esta
  // función se llama también desde dentro de un setTimeout encadenado (el
  // turno de la CPU), y ese callback queda "congelado" con el closure de
  // cuando se programó — leer combatLog del estado de React ahí adentro
  // daría un valor viejo, sin la jugada que se acaba de agregar, y cada
  // jugada de la CPU terminaría PISANDO el registro en vez de sumarle.
  function performMove(currentFen, currentRegistry, currentHumanColor, currentCombatLog, from, to, promotion, techniqueId = null) {
    const attackerBefore = currentRegistry[from];
    let defenderBefore = currentRegistry[to];
    if (!defenderBefore) {
      // por si es al paso: buscamos con la misma lógica que combat.js
      const tempChess = new Chess();
      tempChess.load(currentFen);
      const move = tempChess.moves({ square: from, verbose: true }).find((m) => m.to === to);
      if (move) defenderBefore = currentRegistry[capturedSquareFor(move)];
    }
    const streak = attackerBefore && defenderBefore
      ? currentFocusStreak(attackerBefore.color, defenderBefore.id)
      : 0;

    const result = techniqueId
      ? resolveTechniqueAttack({ fen: currentFen, registry: currentRegistry, from, to, focusStreak: streak })
      : resolveCombatMove({ fen: currentFen, registry: currentRegistry, from, to, promotion, focusStreak: streak });
    if (!result) return;

    if (attackerBefore?.color === currentHumanColor) {
      const creditSignal = combatCreditSignalForAttempt({
        fen: currentFen, from, to, promotion, attacker: attackerBefore, defender: defenderBefore, hit: result.hit,
      });
      if (creditSignal.underdogCredits || creditSignal.tacticalCredits) {
        unitBattleStatsRef.current = {
          ...unitBattleStatsRef.current,
          underdogCredits: (unitBattleStatsRef.current.underdogCredits || 0) + creditSignal.underdogCredits,
          tacticalCredits: (unitBattleStatsRef.current.tacticalCredits || 0) + creditSignal.tacticalCredits,
        };
      }
    }

    setSelected(null);
    setActiveTechnique(null);
    setFen(result.fen);

    // Solo se registra si el ataque conectó (o no era una captura, que
    // siempre "acierta"). Un esquive no mueve la pieza — no hay una jugada
    // real que analizar ahí, así que ni se guarda.
    const updatedLog = result.hit === false
      ? currentCombatLog
      : [
          ...currentCombatLog,
          {
            fenBefore: currentFen, // necesario para la pista inversa: analizamos la posición ANTES de mover
            fenAfter: result.fen,
            san: result.applied.san,
            from: result.applied.from,
            to: result.applied.to,
            piece: result.applied.piece,
            captured: result.isCapture,
            by: attackerBefore.color === currentHumanColor ? 'human' : 'cpu',
            techniqueId: result.techniqueId || null,
            techniqueLabel: result.techniqueLabel || null,
          },
        ];
    setCombatLog(updatedLog);
    // La XP se banca durante la batalla, pero ya NO se gasta acá — ni
    // sola (auto-nivelado) ni a mano (comprando fuerza/velocidad): eso
    // ahora pasa una sola vez, al terminar la batalla, para que no se
    // pueda reaccionar en caliente a la posición actual subiendo justo la
    // pieza que más te conviene en ese instante. Ver el final de la
    // batalla, donde se aplica autoLevelUp de una sola vez si corresponde.
    const finalRegistry = result.registry;
    setRegistry(finalRegistry);

    if (result.hit === true && result.isCapture && attackerBefore?.color === currentHumanColor && attackerBefore.type !== 'k' && attackerBefore.identityId) {
      unitBattleStatsRef.current = {
        ...unitBattleStatsRef.current,
        killsByIdentity: incrementIdentityCounter(unitBattleStatsRef.current.killsByIdentity, attackerBefore.identityId, 1),
      };
    }

    updateFocusAfterAction(result);

    animSeqRef.current += 1;
    setPendingAnim({
      from,
      to,
      seq: animSeqRef.current,
      kind: result.hit === false ? 'miss' : 'move',
      capture: result.hit === true,
    });

    if (result.hit === false) playMissSound();
    else if (result.isCapture) playCaptureSound();
    else playMoveSound();

    pushLog(buildCombatLogEntry(result, currentHumanColor));

    const chessAfter = new Chess();
    chessAfter.load(result.fen);

    // chess.js pierde su historial interno porque Combate reconstruye desde
    // FEN tras cada turno (y nuestros fallos son turnos nulos). Por eso la
    // triple repetición se cuenta explícitamente con los 4 campos posicionales
    // del FEN, incluidos los turnos fallidos.
    const posKey = repetitionKey(result.fen);
    const occurrence = (positionCountsRef.current.get(posKey) || 0) + 1;
    positionCountsRef.current.set(posKey, occurrence);
    const reachedRepetition = occurrence >= 3;
    if (reachedRepetition) setRepetitionDraw(true);

    // Boss: sólo el rey del piso final usa HP. Cada jaque humano hace daño;
    // el mate hace 2. Si el mate no lo mata, rompe la fase y reinicia el
    // tablero del boss de forma explícita — no fingimos una captura del rey.
    if (bossConfig && attackerBefore?.color === currentHumanColor) {
      const damage = bossDamageAfterHumanMove(chessAfter, currentHumanColor, bossConfig);
      if (damage > 0) {
        if (attackerBefore?.identityId && attackerBefore.type !== 'k') {
          unitBattleStatsRef.current = {
            ...unitBattleStatsRef.current,
            bossDamageByIdentity: incrementIdentityCounter(unitBattleStatsRef.current.bossDamageByIdentity, attackerBefore.identityId, damage),
          };
        }
        const nextHp = Math.max(0, (bossHpRef.current ?? bossConfig.maxHp) - damage);
        bossHpRef.current = nextHp;
        setBossHp(nextHp);
        setBossPhase(bossPhaseForHp(nextHp, bossConfig));
        pushLog({
          text: chessAfter.isCheckmate()
            ? `JAQUE MATE CRÍTICO · -${damage} HP a ${bossConfig.label} · ${nextHp}/${bossConfig.maxHp} HP`
            : `Jaque a ${bossConfig.label} · -${damage} HP · ${nextHp}/${bossConfig.maxHp} HP`,
          tone: 'good',
          kind: 'boss',
        });

        if (nextHp <= 0) {
          if (attackerBefore?.identityId && attackerBefore.type !== 'k') {
            unitBattleStatsRef.current = { ...unitBattleStatsRef.current, bossFinisherIdentityId: attackerBefore.identityId };
          }
          finalizeBattle('win', finalRegistry, updatedLog, currentHumanColor);
          return;
        }
        if (chessAfter.isCheckmate()) {
          setBusy(true);
          setTimeout(() => resetBossPhase(currentHumanColor, finalRegistry), 650);
          return;
        }
      }
    }

    if (chessAfter.isGameOver() || reachedRepetition) {
      const isWin = chessAfter.isCheckmate() && chessAfter.turn() !== currentHumanColor;
      const isLoss = chessAfter.isCheckmate() && chessAfter.turn() === currentHumanColor;
      // En boss, un mate humano que no bajó HP a cero ya se interceptó arriba.
      const outcome = isWin ? 'win' : isLoss ? 'loss' : 'draw';
      finalizeBattle(outcome, finalRegistry, updatedLog, currentHumanColor);
      return;
    }

    persistBattleSession({
      nextFen: result.fen,
      nextRegistry: finalRegistry,
      nextCombatLog: updatedLog,
      nextBossHp: bossHpRef.current,
      nextBossPhase: bossConfig ? bossPhaseForHp(bossHpRef.current, bossConfig) : null,
    });

    if (chessAfter.turn() !== currentHumanColor) {
      setBusy(true);
      setTimeout(() => runCpuTurn(result.fen, finalRegistry, currentHumanColor, updatedLog), CPU_DELAY_MS);
    }
  }

  async function runCpuTurn(currentFen, currentRegistry, currentHumanColor, currentCombatLog) {
    setCpuRetryNeeded(false);
    cpuRetryContextRef.current = { fen: currentFen, registry: currentRegistry, humanColor: currentHumanColor, combatLog: currentCombatLog };
    let suggestion;
    let recoveredLocally = false;
    try {
      const resolved = await resolveCombatCpuTurnSuggestion({
        fen: currentFen,
        difficulty,
        analyzePosition: api.analyzePosition,
      });
      suggestion = resolved.suggestion;
      recoveredLocally = resolved.source === 'local';
      if (recoveredLocally) {
        pushLog({ text: 'Análisis remoto no disponible · la CPU continúa con cálculo local. La batalla sigue.', tone: 'neutral', kind: 'event' });
      }
    } catch (e) {
      onError?.(e?.message || 'La CPU no pudo completar su turno.');
      pushLog({ text: 'La CPU no pudo completar su turno. Reintentar conserva exactamente esta batalla y sus bajas actuales.', tone: 'bad', kind: 'event' });
      setCpuRetryNeeded(true);
      setBusy(false);
      return;
    }
    cpuRetryContextRef.current = null;
    performMove(currentFen, currentRegistry, currentHumanColor, currentCombatLog, suggestion.from, suggestion.to, suggestion.promotion);
    if (recoveredLocally) setCpuRetryNeeded(false);
    setBusy(false);
  }

  function retryCpuTurn() {
    if (phase !== 'battle' || busy) return false;
    const pending = cpuRetryContextRef.current || { fen, registry, humanColor, combatLog };
    try {
      const chess = new Chess(pending.fen);
      if (chess.turn() === pending.humanColor) return false;
    } catch {
      return false;
    }
    setBusy(true);
    void runCpuTurn(pending.fen, pending.registry, pending.humanColor, pending.combatLog);
    return true;
  }

  function openPieceInfo(square) {
    if (registry[square]) setInfoSquare(square);
  }

  function handleBuyStat(stat) {
    if (!infoSquare) return;
    const piece = registry[infoSquare];
    if (!piece) return;
    const updated = buyStatPoint(piece, stat);
    if (!updated) return; // no alcanza el XP, el botón ya debería estar deshabilitado igual
    setRegistry((prev) => ({ ...prev, [infoSquare]: updated }));
  }

  function handleActivateTechnique() {
    if (!infoSquare || phase !== 'battle' || busy || localChess.turn() !== humanColor) return;
    const piece = registry[infoSquare];
    if (!piece || piece.color !== humanColor || !piece.equippedTechnique || piece.techniqueUsed) return;
    const targets = techniqueTargetsFor(fen, registry, infoSquare);
    if (targets.length === 0) return;
    setActiveTechnique({ from: infoSquare, techniqueId: piece.equippedTechnique });
    setSelected(infoSquare);
    setInfoSquare(null);
  }

  function handleSquareClick(square) {
    if (phase !== 'battle' || busy || localChess.turn() !== humanColor) return;

    if (activeTechnique) {
      if (square === activeTechnique.from) {
        setActiveTechnique(null);
        setSelected(null);
        return;
      }
      const targets = techniqueTargetsFor(fen, registry, activeTechnique.from);
      if (targets.includes(square)) {
        const attacker = registry[activeTechnique.from];
        const defender = registry[square];
        const streak = attacker && defender ? currentFocusStreak(attacker.color, defender.id) : 0;
        const chance = techniqueAttackChance({ registry, from: activeTechnique.from, to: square, focusStreak: streak });
        setPendingAttack({
          from: activeTechnique.from,
          to: square,
          promotion: undefined,
          attacker,
          defender,
          chance,
          techniqueId: activeTechnique.techniqueId,
          techniqueLabel: techniqueById(activeTechnique.techniqueId)?.label || activeTechnique.techniqueId,
        });
      }
      setActiveTechnique(null);
      setSelected(null);
      return;
    }

    if (!selected) {
      const piece = localChess.get(square);
      if (piece && piece.color === humanColor) setSelected(square);
      return;
    }

    if (square === selected) {
      setSelected(null);
      return;
    }

    const move = localChess.moves({ square: selected, verbose: true }).find((m) => m.to === square);
    if (!move) {
      const piece = localChess.get(square);
      if (piece && piece.color === humanColor) setSelected(square);
      else setSelected(null);
      return;
    }

    if (move.promotion) {
      setPendingPromotion({ from: selected, to: square });
      return;
    }

    proposeOrCommitMove(selected, square, undefined, move);
  }

  // Si la jugada captura algo, primero mostramos el % de acierto y esperamos
  // confirmación (un segundo clic en "Atacar") antes de comprometerla. Si no
  // es una captura, se aplica directo — no tiene sentido "confirmar" un
  // movimiento normal, sin riesgo.
  function proposeOrCommitMove(from, to, promotion, moveInfo) {
    if (moveInfo?.captured) {
      const attacker = registry[from];
      const capturedSquare = capturedSquareFor(moveInfo);
      const defender = registry[capturedSquare];

      // En ajedrez real NUNCA se captura al rey — cuando queda amenazado es
      // jaque, y si no hay escapatoria es mate; chess.js jamás genera una
      // jugada que "capture" un rey. Si esto pasa es que el registro se
      // desincronizó (dato corrupto), no una captura real: aplicamos la
      // jugada directo, sin tirada ni modal de ataque.
      if (defender?.type === 'k') {
        performMove(fen, registry, humanColor, combatLog, from, to, promotion);
        return;
      }

      // Si ya está en jaque, esta jugada tiene que resolverlo sí o sí — el
      // motor la va a forzar a conectar igual, así que reflejamos eso acá
      // para no mostrar un % que después no se cumple.
      const forcedHit = isForcedCombatCapture(fen, from, to, promotion);
      const streak = attacker && defender ? currentFocusStreak(attacker.color, defender.id) : 0;
      const chance = forcedHit ? 1 : hitChance(attacker, defender, streak);
      setPendingAttack({ from, to, promotion, attacker, defender, chance });
      setSelected(null);
      return;
    }
    performMove(fen, registry, humanColor, combatLog, from, to, promotion);
  }

  function confirmAttack() {
    if (!pendingAttack) return;
    const { from, to, promotion, techniqueId } = pendingAttack;
    setPendingAttack(null);
    performMove(fen, registry, humanColor, combatLog, from, to, promotion, techniqueId || null);
  }

  function cancelAttack() {
    setPendingAttack(null);
    setActiveTechnique(null);
  }

  // Doble clic: siempre muestra la info de la pieza (sea tuya o rival, te
  // toque el turno o no). Es un gesto aparte del click simple, así no
  // interfiere con seleccionar/mover.
  function handleSquareDoubleClick(square) {
    if (phase !== 'battle') return;
    openPieceInfo(square);
  }

  function choosePromotion(code) {
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    const moveInfo = localChess.moves({ square: from, verbose: true }).find((m) => m.to === to);
    proposeOrCommitMove(from, to, code, moveInfo);
  }

  function suspendBattleToMenu() {
    if (phase !== 'battle') return;

    // Salir de la pantalla no equivale a retirarse de la campaña. Guardamos
    // explícitamente el snapshot más reciente y dejamos la batalla exactamente
    // donde estaba. Al volver a Combat Chess, RoguelikeScreen detecta la sesión
    // persistida y ofrece continuar la misma campaña/pelea, sin rerollear nada.
    const persisted = persistBattleSession();
    if (!persisted) {
      onError?.('No se pudo guardar la batalla antes de salir. Sigue en el tablero e inténtalo de nuevo.');
      return;
    }
    onExit?.();
  }

  function retireBattle() {
    if (phase !== 'battle') return;

    // En Roguelike, "Salir del combate" no puede ser un reset gratuito del
    // piso. Conservamos el progreso/bajas que existen en ESTE estado, pero no
    // No concedemos créditos por retirarse: abandonar no debe ser una ruta de
    // farmeo y el inventario persistente conserva exactamente su estado.
    const battleId = `combat-${Date.now()}`;
    const battleDate = new Date().toISOString();
    const deployedKeys = (battleParticipantsRef.current || []).map((participant) => participant.slotKey).filter(Boolean);
    const rosterAfterSurvival = saveSurvivorsToRoster(registry, roster, humanColor, 'retired', deployedKeys);
    const survivorIdentityIds = Object.values(registry)
      .filter((piece) => piece.color === humanColor && piece.type !== 'k' && piece.identityId)
      .map((piece) => piece.identityId);
    const unitStats = unitBattleStatsRef.current || emptyUnitBattleStats();
    const nextRoster = recordUnitBattle(rosterAfterSurvival, {
      battleId,
      date: battleDate,
      outcome: 'retired',
      participants: battleParticipantsRef.current,
      survivorIdentityIds,
      killsByIdentity: unitStats.killsByIdentity,
      bossDamageByIdentity: unitStats.bossDamageByIdentity,
      bossFinisherIdentityId: unitStats.bossFinisherIdentityId,
      bossDefeated: false,
    });
    saveRoster(nextRoster);
    setRoster(nextRoster);
    const battleRecord = {
      id: battleId,
      date: battleDate,
      difficulty,
      baseDifficulty: difficultyBalance.base,
      armyThreatBonus: difficultyBalance.appliedBonus,
      humanColor,
      outcome: 'retired',
      log: combatLog,
      variant: combatVariant || 'combat',
      survivorCount: Object.values(registry).filter((p) => p.color === humanColor).length,
      roguelikeFloor: combatVariant === 'roguelike' ? roguelikeFloor : null,
      roguelikeMode: combatVariant === 'roguelike' ? (roguelikeMode || 'tower') : null,
    };
    const veteranPieces = Object.values(nextRoster.pieces).filter((piece) => piece?.alive !== false && ((piece?.strengthPoints || 0) + (piece?.speedPoints || 0)) >= 1).length;
    const elitePieces = Object.values(nextRoster.pieces).filter((piece) => piece?.alive !== false && (1 + (piece?.strengthPoints || 0) + (piece?.speedPoints || 0)) >= 6).length;
    const serviceResult = recordCombatServiceEvent({
      battleId: battleRecord.id,
      outcome: 'retired',
      survivorCount: battleRecord.survivorCount,
      veteranPieces,
      elitePieces,
      variant: battleRecord.variant,
      roguelikeFloor: battleRecord.roguelikeFloor,
      roguelikeMode: battleRecord.roguelikeMode,
      bossDefeated: false,
    });
    setServiceRecord(serviceResult.record);
    saveCombatBattle(battleRecord);
    const debrief = buildCombatDebrief({
      outcome: 'retired',
      beforeRoster: battleStartRosterRef.current || roster,
      afterRoster: nextRoster,
      participants: battleParticipantsRef.current,
      survivorIdentityIds,
      killsByIdentity: unitStats.killsByIdentity,
      bossDamageByIdentity: unitStats.bossDamageByIdentity,
      battleRecord,
      serviceResult,
      creditsGained: 0,
    });
    setBattleRecap({ survivorCount: battleRecord.survivorCount, totalCount: 16, creditsGained: 0, record: battleRecord, serviceResult, debrief });
    clearBattleSession();
    onBattleResult?.('retired', debrief, {
      gameId: activityGameIdRef.current || battleRecord.id,
      battleRecord,
    });
    activityGameIdRef.current = null;
    setPhase('over');
  }

  function backToSetup() {
    if (!canReturnCombatToSetup({ phase, combatVariant })) {
      // eslint-disable-next-line no-console
      console.error('[Combat] Transición battle -> setup bloqueada durante una operación activa.', { combatSessionId });
      return;
    }
    clearBattleSession();
    setPhase('setup');
  }

  const rosterActions = createCombatRosterActions({ setRoster, requireDeploymentConfirmation, setDeploymentConfirmed });
  const handleResetRoster = rosterActions.resetRoster;
  const handleBuyRosterStat = rosterActions.buyStat;
  const handleRenameRosterPiece = rosterActions.rename;
  const handleMetamorphoseRosterPiece = rosterActions.metamorphose;
  const handleDeployRosterUnit = rosterActions.deploy;
  const handleRemoveDeployedUnit = rosterActions.removeDeployed;
  const handleResetDeployment = rosterActions.resetDeployment;
  const handleAutofillDeployment = rosterActions.autofill;
  const handleApplyDeploymentPreset = rosterActions.applyPreset;
  const handleUnlockRosterTechnique = rosterActions.unlockTechnique;
  const handleEquipRosterTechnique = rosterActions.equipTechnique;
  const handleReviveRosterPiece = rosterActions.revive;
  const handleReplaceRosterPiece = rosterActions.replace;

  function handleHireMercenary(offer, contract) {
    let hired = false;
    setRoster((current) => {
      const next = hireMercenary(current, offer, contract);
      hired = next !== current;
      if (hired) saveRoster(next);
      return next;
    });
    return hired;
  }

  function handleBuyEquipment(itemId, unitKey) {
    let bought = false;
    setRoster((current) => {
      const next = buyEquipment(current, itemId, unitKey);
      bought = next !== current;
      if (bought) saveRoster(next);
      return next;
    });
    return bought;
  }

  const rosterCount = Object.values(roster.pieces).filter((p) => p.alive !== false).length;
  const deadCount = Object.values(roster.pieces).filter((p) => p.alive === false).length;


  const status = localChess.isCheckmate() && !(bossConfig && (bossHpRef.current || 0) > 0)
    ? 'checkmate'
    : repetitionDraw
    ? 'repetition'
    : localChess.isStalemate()
    ? 'stalemate'
    : localChess.isThreefoldRepetition()
    ? 'repetition'
    : localChess.isDraw()
    ? 'draw'
    : localChess.isCheck()
    ? 'check'
    : 'playing';
  const statusLabel = STATUS_LABELS[status];
  const statusClass = ['checkmate', 'stalemate', 'draw', 'repetition'].includes(status)
    ? 'danger'
    : status === 'check'
    ? 'success'
    : '';
  const statusText = cpuRetryNeeded
    ? 'La CPU necesita reintentar su turno'
    : activeTechnique
    ? `TÉCNICA · ${techniqueById(activeTechnique.techniqueId)?.label || activeTechnique.techniqueId}: elige un objetivo marcado`
    : busy
    ? 'La CPU está pensando…'
    : statusLabel || (localChess.turn() === humanColor ? 'Tu turno' : 'Turno de la CPU');

  return {
    phase, combatLog, battleRecap, ratingInfo, difficulty, difficultyBalance, colorChoice, setColorChoice,
    pieceVeteranMarks,
    autoLevelUpEnabled, setAutoLevelUpEnabled, humanColor, fen, registry, selected,
    pendingPromotion, pendingAttack, infoSquare, activeTechnique, busy, cpuRetryNeeded, retryCpuTurn, pendingAnim, log, roster,
    showArmy, setShowArmy, showMarket, setShowMarket, showDeployment, setShowDeployment, deploymentConfirmed, requireDeploymentConfirmation, handleConfirmDeployment, localChess, legalTargets,
    pieceLevels, pieceXp, armySummary, infoPiece, infoUnitRecord, deadRosterEntries, serviceSummary, handleStartBattleClick, handleQuickStartBattle,
    startBattle, confirmAttack, cancelAttack, choosePromotion, suspendBattleToMenu, retireBattle, backToSetup, handleResetRoster,
    handleBuyRosterStat, handleReviveRosterPiece, handleReplaceRosterPiece, handleRenameRosterPiece, handleMetamorphoseRosterPiece, handleDeployRosterUnit, handleRemoveDeployedUnit, handleResetDeployment, handleAutofillDeployment, handleApplyDeploymentPreset, handleUnlockRosterTechnique, handleEquipRosterTechnique, handleHireMercenary, handleBuyEquipment, handleBuyStat,
    handleSquareClick, handleSquareDoubleClick, handleActivateTechnique, infoTechniqueTargets, setInfoSquare,
    status, statusLabel, statusClass, statusText, bossHp, bossPhase, bossConfig,
  };
}
