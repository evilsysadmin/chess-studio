import { useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { api } from '../api.js';
import { playMoveSound, playCaptureSound, playMissSound, playSuccessSound } from '../sound.js';
import {
  BASE_STATS,
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
import { loadRoster, saveRoster, resetRoster, applyRosterToRegistry, saveSurvivorsToRoster, revivePiece, expireDeadPieces } from '../combatRoster.js';
import { saveCombatBattle } from '../combatHistory.js';
import { loadCombatService, recordCombatServiceEvent, summarizeCombatService } from '../combatService.js';
import { recordUnitBattle, unitRecordForKey } from '../combatUnitService.js';
import { applyRosterMetamorphosesToPosition, setRosterDeploymentType, persistMetamorphosedRoster } from '../combatMetamorphosis.js';
import { techniqueTargetsFor, techniqueAttackChance, resolveTechniqueAttack, techniqueById, unlockRosterTechnique, setRosterEquippedTechnique } from '../combatTechniques.js';
import { proceduralNarrative } from '../narrativeProvider.js';
import { checkAchievements } from '../achievements.js';
import { loadRating, ratingProgress, difficultyForRating } from '../playerRating.js';
import { applyRunPerksToRegistry } from '../roguelikePerks.js';
import { bossDamageAfterHumanMove, bossPhaseForHp } from '../roguelikeBoss.js';
import { balancedCombatDifficulty } from '../combatBalance.js';

const STATUS_LABELS = {
  playing: '',
  check: 'Jaque',
  checkmate: 'Jaque mate',
  stalemate: 'Tablas por ahogado',
  draw: 'Tablas',
  repetition: 'Tablas por repetición',
};

// Tiempo (ms) antes de que la CPU juegue, tanto en su primera jugada como
// en las siguientes — para que se note que "está pensando".
const CPU_DELAY_MS = 500;

function resolveHumanColor(choice) {
  if (choice === 'w' || choice === 'b') return choice;
  return Math.random() < 0.5 ? 'w' : 'b';
}

function emptyUnitBattleStats() {
  return { killsByIdentity: {}, bossDamageByIdentity: {}, bossFinisherIdentityId: null };
}

function incrementIdentityCounter(bucket, identityId, amount = 1) {
  if (!identityId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return bucket;
  return { ...bucket, [identityId]: (bucket[identityId] || 0) + Number(amount) };
}

function buildLogEntry(result, humanColor) {
  if (!result.isCapture) return null;
  const { attacker, defender, hit, chance, survivalXp } = result;
  if (!attacker || !defender) return null; // red de seguridad: sin datos suficientes, no arriesgamos un crash
  const attackerIsHuman = attacker.color === humanColor;
  const attackerName = `${attacker.alias ? `${attacker.alias}, ` : ''}${BASE_STATS[attacker.type].name}`;
  const defenderName = `${defender.alias ? `${defender.alias}, ` : ''}${BASE_STATS[defender.type].name}`;
  const pct = Math.round(chance * 100);

  if (result.techniqueId) {
    const text = proceduralNarrative({
      type: hit ? 'technique_hit' : 'technique_miss',
      alias: attacker.alias || BASE_STATS[attacker.type].name,
      piece: BASE_STATS[attacker.type].name,
      technique: result.techniqueLabel || result.techniqueId,
      target: defenderName,
    });
    return { text: `${text} · ${pct}% de acierto`, tone: hit ? (attackerIsHuman ? 'good' : 'bad') : 'neutral' };
  }

  if (hit) {
    const subject = attackerIsHuman ? 'Tu' : 'La CPU: su';
    const text = `${subject} ${attackerName} (nv.${derivedLevel(attacker)}) elimina ${defenderName} (nv.${derivedLevel(defender)}) · ${pct}% de acierto`;
    return { text, tone: attackerIsHuman ? 'good' : 'bad' };
  }

  const attackerLabel = attackerIsHuman ? 'tu' : 'la CPU';
  const text = `${defenderName} (nv.${derivedLevel(defender)}) esquiva el ataque de ${attackerLabel} ${attackerName} · +${survivalXp} XP por sobrevivir`;
  return { text, tone: defender.color === humanColor ? 'good' : 'neutral' };
}


export function useCombatController({ onExit, onError, onHistory, onViewBattle, initialFen, onBattleStart, onBattleResult, difficultyOverride, forcedHumanColor, combatVariant, runPerks = [], bossConfig = null, roguelikeFloor = null, roguelikeMode = null }) {
  const [phase, setPhase] = useState('setup'); // 'setup' | 'battle' | 'over'
  // Registro jugada-a-jugada de ESTA batalla, para la "pista inversa" y el
  // historial de Combate. No es un historial SAN normal (los fallos/esquives
  // NO mueven la pieza, solo pasan el turno — eso rompe el supuesto de
  // "alternancia estricta blanco/negro" del que depende chess.js para
  // reproducir una partida jugada a jugada), así que se guarda el FEN
  // resultante de cada paso directamente, en vez de reconstruirlo después.
  const [combatLog, setCombatLog] = useState([]);
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
  const [autoLevelUpEnabled, setAutoLevelUpEnabled] = useState(true);
  const [humanColor, setHumanColor] = useState('w');

  const [fen, setFen] = useState(new Chess().fen());
  const [registry, setRegistry] = useState(() => createInitialRegistry(new Chess()));
  const [selected, setSelected] = useState(null);
  const [activeTechnique, setActiveTechnique] = useState(null); // { from, techniqueId } durante selección de objetivo
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [pendingAttack, setPendingAttack] = useState(null); // { from, to, promotion, attacker, defender, chance }
  const [infoSquare, setInfoSquare] = useState(null); // casilla inspeccionada (para poder refrescar tras comprar)
  const [busy, setBusy] = useState(false);
  const [pendingAnim, setPendingAnim] = useState(null);
  const [log, setLog] = useState([]);
  const [roster, setRoster] = useState(() => loadRoster());
  const difficultyBalance = useMemo(() => balancedCombatDifficulty(baseDifficulty, roster), [baseDifficulty, roster]);
  const difficulty = difficultyBalance.adjusted;
  const [serviceRecord, setServiceRecord] = useState(() => loadCombatService());
  const [showArmy, setShowArmy] = useState(false);
  const [showExpireWarning, setShowExpireWarning] = useState(false);
  // El único modal inline de esta pantalla (los demás — PieceInfoModal,
  // AttackConfirmModal, ArmyScreen — ya traen su propio ESC incorporado).
  // Un solo listener de ESC para toda la pantalla, con prioridad: si hay un
  // modal abierto encima (la advertencia de piezas caídas), lo cierra a él
  // primero. Si no, vuelve al menú principal — salvo en medio de una
  // batalla ('battle'), donde un ESC sin querer no debería sacarte de una
  // pelea activa sin avisar.
  useEscapeToClose(() => {
    if (showExpireWarning) {
      setShowExpireWarning(false);
      return;
    }
    if (phase === 'setup' || phase === 'over') {
      onExit();
    }
  });
  // Fuego concentrado: a quién le viene pegando cada bando (por id de la
  // pieza objetivo) y cuántos ataques consecutivos lleva contra ella.
  // Refs, no estado React: los turnos de CPU viajan por setTimeout y una
  // closure vieja no debe olvidar el fuego concentrado ni las repeticiones.
  const focusRef = useRef({ w: null, b: null }); // { targetId, streak } | null
  const positionCountsRef = useRef(new Map());
  const [repetitionDraw, setRepetitionDraw] = useState(false);
  const animSeqRef = useRef(0);
  const bossHpRef = useRef(bossConfig?.maxHp || null);
  const [bossHp, setBossHp] = useState(bossConfig?.maxHp || null);
  const [bossPhase, setBossPhase] = useState(1);
  const battleStartRosterRef = useRef(null);
  const battleParticipantsRef = useRef([]);
  const unitBattleStatsRef = useRef(emptyUnitBattleStats());

  const localChess = useMemo(() => {
    const c = new Chess();
    c.load(fen);
    return c;
  }, [fen]);

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

  const infoPiece = infoSquare ? registry[infoSquare] : null;
  const infoUnitRecord = infoPiece && infoPiece.color === humanColor && infoPiece.type !== 'k'
    ? unitRecordForKey(roster, rosterKeyFor(infoPiece))
    : null;
  const infoTechniqueTargets = infoSquare ? techniqueTargetsFor(fen, registry, infoSquare) : [];
  const serviceSummary = useMemo(() => summarizeCombatService(serviceRecord), [serviceRecord]);

  const deadRosterEntries = Object.entries(roster.pieces).filter(([, p]) => p.alive === false);

  // El botón "Empezar combate" pasa por acá primero: si hay piezas caídas
  // sin recuperar, avisamos antes de que pierdan su veteranía en vez de
  // borrarlas en silencio.
  function handleStartBattleClick() {
    if (deadRosterEntries.length > 0) {
      setShowExpireWarning(true);
      return;
    }
    startBattle();
  }

  function startBattle() {
    const resolved = forcedHumanColor || resolveHumanColor(colorChoice);

    // Se cierra acá la ventana de revivir: cualquier pieza que sigue caída
    // sin que la hayas recuperado pierde su veteranía a partir de ahora; el slot volverá como nivel 1.
    const activeRoster = expireDeadPieces(roster);
    if (activeRoster !== roster) {
      setRoster(activeRoster);
      saveRoster(activeRoster);
    }

    const chess = new Chess();
    if (initialFen) chess.load(initialFen);
    const baseRegistry = createInitialRegistry(chess);
    const metamorphosedRegistry = applyRosterMetamorphosesToPosition(chess, baseRegistry, activeRoster, resolved);
    const startFen = chess.fen();
    const rosterRegistry = applyRosterToRegistry(metamorphosedRegistry, activeRoster, resolved);
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
    setLog([]);
    focusRef.current = { w: null, b: null };
    positionCountsRef.current = new Map([[repetitionKey(startFen), 1]]);
    setRepetitionDraw(false);
    setPhase('battle');
    onBattleStart?.();

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
    setLog((prev) => [entry, ...prev].slice(0, 8));
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
        Object.entries(finalRegistry).map(([sq, piece]) =>
          piece.color === currentHumanColor ? [sq, autoLevelUp(piece)] : [sq, piece]
        )
      );
    }

    const battleId = `combat-${Date.now()}`;
    const battleDate = new Date().toISOString();

    // Los bonus del intento (`runStrengthBonus/runSpeedBonus`) no se guardan:
    // saveSurvivorsToRoster sólo persiste puntos comprados + XP bancado.
    const rosterAfterSurvival = saveSurvivorsToRoster(leveledRegistry, roster, currentHumanColor, outcome);
    const survivorIdentityIds = Object.values(finalRegistry)
      .filter((piece) => piece.color === currentHumanColor && piece.type !== 'k' && piece.identityId)
      .map((piece) => piece.identityId);
    const unitStats = unitBattleStatsRef.current || emptyUnitBattleStats();
    const nextRoster = recordUnitBattle(rosterAfterSurvival, {
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

    setBattleRecap({
      survivorCount,
      totalCount: 16,
      xpGained: Math.max(0, nextRoster.combatXp - roster.combatXp),
      record: battleRecord,
      serviceResult,
    });

    onBattleResult?.(outcome);
    setPhase('over');
  }

  function resetBossPhase(currentHumanColor, survivorRegistry) {
    const chess = new Chess();
    if (initialFen) chess.load(initialFen);
    const baseRoster = battleStartRosterRef.current || roster;
    const phaseBaseRegistry = createInitialRegistry(chess);
    const phaseMetamorphosedRegistry = applyRosterMetamorphosesToPosition(chess, phaseBaseRegistry, baseRoster, currentHumanColor);
    let fresh = applyRunPerksToRegistry(
      applyRosterToRegistry(phaseMetamorphosedRegistry, baseRoster, currentHumanColor),
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
    setBossPhase(bossPhaseForHp(bossHpRef.current, bossConfig?.maxHp));
    setBusy(false);
    pushLog({ text: `El Rey Viejo rompe la posición y abre una nueva fase · ${bossHpRef.current}/${bossConfig?.maxHp} HP · tus bajas se arrastran`, tone: 'bad' });
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

    pushLog(buildLogEntry(result, currentHumanColor));

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
      const damage = bossDamageAfterHumanMove(chessAfter, currentHumanColor);
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
        setBossPhase(bossPhaseForHp(nextHp, bossConfig.maxHp));
        pushLog({
          text: damage === 2
            ? `JAQUE MATE CRÍTICO · -2 HP al Rey Viejo · ${nextHp}/${bossConfig.maxHp} HP`
            : `Jaque al Rey Viejo · -1 HP · ${nextHp}/${bossConfig.maxHp} HP`,
          tone: 'good',
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

    if (chessAfter.turn() !== currentHumanColor) {
      setBusy(true);
      setTimeout(() => runCpuTurn(result.fen, finalRegistry, currentHumanColor, updatedLog), CPU_DELAY_MS);
    }
  }

  async function runCpuTurn(currentFen, currentRegistry, currentHumanColor, currentCombatLog) {
    let suggestion;
    try {
      suggestion = await api.analyzePosition(currentFen, difficulty);
    } catch (e) {
      onError?.(e.message);
      setBusy(false);
      return;
    }
    performMove(currentFen, currentRegistry, currentHumanColor, currentCombatLog, suggestion.from, suggestion.to, undefined);
    setBusy(false);
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

  function retireBattle() {
    if (phase !== 'battle') return;

    // En Roguelike, "Salir del combate" no puede ser un reset gratuito del
    // piso. Conservamos el progreso/bajas que existen en ESTE estado, pero no
    // damos XP de combate por retirarse (COMBAT_XP_REWARD no tiene 'retired').
    const battleId = `combat-${Date.now()}`;
    const battleDate = new Date().toISOString();
    const rosterAfterSurvival = saveSurvivorsToRoster(registry, roster, humanColor, 'retired');
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
    onBattleResult?.('retired');
    setPhase('over');
  }

  function backToSetup() {
    setPhase('setup');
  }

  function handleResetRoster() {
    setRoster(resetRoster());
  }

  // Compra un punto de fuerza/velocidad directo sobre el roster guardado,
  // fuera de una batalla — reconstruye una "pieza virtual" a partir del
  // slot (tipo + lo guardado), la actualiza, y persiste el resultado.
  function handleBuyRosterStat(key, stat) {
    setRoster((prev) => {
      const saved = prev.pieces[key] || { strengthPoints: 0, speedPoints: 0, bankedXp: 0, alive: true };
      if (saved.alive === false) return prev; // no se puede invertir en una pieza caída, primero hay que revivirla
      const virtualPiece = { type: saved.deploymentType || key.split('-')[0], ...saved };
      const updated = buyStatPoint(virtualPiece, stat);
      if (!updated) return prev;
      const next = {
        ...prev,
        pieces: {
          ...prev.pieces,
          [key]: { ...saved, strengthPoints: updated.strengthPoints, speedPoints: updated.speedPoints, bankedXp: updated.bankedXp, alive: true, deploymentType: saved.deploymentType || null },
        },
      };
      saveRoster(next);
      return next;
    });
  }


  function handleMetamorphoseRosterPiece(key, targetType) {
    setRoster((prev) => {
      const next = setRosterDeploymentType(prev, key, targetType);
      if (next === prev) return prev;
      persistMetamorphosedRoster(next);
      return next;
    });
  }

  function handleUnlockRosterTechnique(key, techniqueId) {
    setRoster((prev) => {
      const next = unlockRosterTechnique(prev, key, techniqueId);
      if (next === prev) return prev;
      saveRoster(next);
      return next;
    });
  }

  function handleEquipRosterTechnique(key, techniqueId) {
    setRoster((prev) => {
      const next = setRosterEquippedTechnique(prev, key, techniqueId);
      if (next === prev) return prev;
      saveRoster(next);
      return next;
    });
  }

  function handleReviveRosterPiece(key, type) {
    setRoster((prev) => {
      const next = revivePiece(prev, key, type);
      if (next === prev) return prev; // no alcanzaba el XP de combate
      saveRoster(next);
      return next;
    });
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
  const statusText = activeTechnique
    ? `TÉCNICA · ${techniqueById(activeTechnique.techniqueId)?.label || activeTechnique.techniqueId}: elige un objetivo marcado`
    : busy
    ? 'La CPU está pensando…'
    : statusLabel || (localChess.turn() === humanColor ? 'Tu turno' : 'Turno de la CPU');

  return {
    phase, combatLog, battleRecap, ratingInfo, difficulty, difficultyBalance, colorChoice, setColorChoice,
    autoLevelUpEnabled, setAutoLevelUpEnabled, humanColor, fen, registry, selected,
    pendingPromotion, pendingAttack, infoSquare, activeTechnique, busy, pendingAnim, log, roster,
    showArmy, setShowArmy, showExpireWarning, setShowExpireWarning, localChess, legalTargets,
    pieceLevels, pieceXp, armySummary, infoPiece, infoUnitRecord, deadRosterEntries, serviceSummary, handleStartBattleClick,
    startBattle, confirmAttack, cancelAttack, choosePromotion, retireBattle, backToSetup, handleResetRoster,
    handleBuyRosterStat, handleReviveRosterPiece, handleMetamorphoseRosterPiece, handleUnlockRosterTechnique, handleEquipRosterTechnique, handleBuyStat,
    handleSquareClick, handleSquareDoubleClick, handleActivateTechnique, infoTechniqueTargets, setInfoSquare,
    status, statusLabel, statusClass, statusText, bossHp, bossPhase, bossConfig,
  };
}
