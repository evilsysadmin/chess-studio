import React, { useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';
import PromotionModal from './PromotionModal.jsx';
import PieceInfoModal from './PieceInfoModal.jsx';
import ArmyScreen from './ArmyScreen.jsx';
import AttackConfirmModal from './AttackConfirmModal.jsx';
import ColorSelector from './ColorSelector.jsx';
import { api } from '../api.js';
import { playMoveSound, playCaptureSound, playMissSound, playSuccessSound } from '../sound.js';
import {
  BASE_STATS,
  createInitialRegistry,
  resolveCombatMove,
  hitChance,
  capturedSquareFor,
  derivedLevel,
  buyStatPoint,
  autoLevelUp,
} from '../combat.js';
import { loadRoster, saveRoster, resetRoster, applyRosterToRegistry, saveSurvivorsToRoster, revivePiece, expireDeadPieces } from '../combatRoster.js';
import { saveCombatBattle } from '../combatHistory.js';
import { checkAchievements } from '../achievements.js';
import { loadRating, ratingProgress, difficultyForRating } from '../playerRating.js';

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

function buildLogEntry(result, humanColor) {
  if (!result.isCapture) return null;
  const { attacker, defender, hit, chance, survivalXp } = result;
  if (!attacker || !defender) return null; // red de seguridad: sin datos suficientes, no arriesgamos un crash
  const attackerIsHuman = attacker.color === humanColor;
  const attackerName = BASE_STATS[attacker.type].name;
  const defenderName = BASE_STATS[defender.type].name;
  const pct = Math.round(chance * 100);

  if (hit) {
    const subject = attackerIsHuman ? 'Tu' : 'La CPU: su';
    const text = `${subject} ${attackerName} (nv.${derivedLevel(attacker)}) elimina ${defenderName} (nv.${derivedLevel(defender)}) · ${pct}% de acierto`;
    return { text, tone: attackerIsHuman ? 'good' : 'bad' };
  }

  const attackerLabel = attackerIsHuman ? 'tu' : 'la CPU';
  const text = `${defenderName} (nv.${derivedLevel(defender)}) esquiva el ataque de ${attackerLabel} ${attackerName} · +${survivalXp} XP por sobrevivir`;
  return { text, tone: defender.color === humanColor ? 'good' : 'neutral' };
}

export default function CombatScreen({ onExit, onError, onHistory, onViewBattle }) {
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
  const difficulty = useMemo(() => difficultyForRating(rating.rating), [rating]);
  const [colorChoice, setColorChoice] = useState('random');
  const [autoLevelUpEnabled, setAutoLevelUpEnabled] = useState(true);
  const [humanColor, setHumanColor] = useState('w');

  const [fen, setFen] = useState(new Chess().fen());
  const [registry, setRegistry] = useState(() => createInitialRegistry(new Chess()));
  const [selected, setSelected] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [pendingAttack, setPendingAttack] = useState(null); // { from, to, promotion, attacker, defender, chance }
  const [infoSquare, setInfoSquare] = useState(null); // casilla inspeccionada (para poder refrescar tras comprar)
  const [busy, setBusy] = useState(false);
  const [pendingAnim, setPendingAnim] = useState(null);
  const [log, setLog] = useState([]);
  const [roster, setRoster] = useState(() => loadRoster());
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
  const [focus, setFocus] = useState({ w: null, b: null }); // { targetId, streak } | null
  const animSeqRef = useRef(0);

  const localChess = useMemo(() => {
    const c = new Chess();
    c.load(fen);
    return c;
  }, [fen]);

  const legalTargets = selected
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

  const deadRosterEntries = Object.entries(roster.pieces).filter(([, p]) => p.alive === false);

  // El botón "Empezar combate" pasa por acá primero: si hay piezas caídas
  // sin revivir, avisamos antes de que se pierdan para siempre en vez de
  // borrarlas en silencio.
  function handleStartBattleClick() {
    if (deadRosterEntries.length > 0) {
      setShowExpireWarning(true);
      return;
    }
    startBattle();
  }

  function startBattle() {
    const resolved = resolveHumanColor(colorChoice);

    // Se cierra acá la ventana de revivir: cualquier pieza que sigue caída
    // sin que la hayas revivido se pierde para siempre a partir de ahora.
    const activeRoster = expireDeadPieces(roster);
    if (activeRoster !== roster) {
      setRoster(activeRoster);
      saveRoster(activeRoster);
    }

    const chess = new Chess();
    const initialFen = chess.fen();
    const initialRegistry = applyRosterToRegistry(createInitialRegistry(chess), activeRoster, resolved);

    setHumanColor(resolved);
    setCombatLog([]);
    setBattleRecap(null);
    setFen(initialFen);
    setRegistry(initialRegistry);
    setSelected(null);
    setPendingPromotion(null);
    setInfoSquare(null);
    setPendingAnim(null);
    setLog([]);
    setFocus({ w: null, b: null });
    setPhase('battle');

    // Si te tocaron negras, las blancas (la CPU) mueven primero — sin esto
    // la partida se queda esperando para siempre a que "alguien" mueva.
    if (resolved === 'b') {
      setBusy(true);
      setTimeout(() => runCpuTurn(initialFen, initialRegistry, resolved, []), CPU_DELAY_MS);
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
    const f = focus[attackerColor];
    if (!f || f.targetId !== defenderId) return 0;
    return f.streak;
  }

  // Actualiza el fuego concentrado después de resolver un ataque: si dio en
  // el blanco, ese objetivo ya no existe — se limpia. Si falló, suma un
  // stack más para el próximo intento contra la misma pieza.
  function updateFocusAfterAttack(attackerColor, defenderId, hit) {
    setFocus((prev) => {
      if (hit) return { ...prev, [attackerColor]: null };
      const current = prev[attackerColor];
      const streak = current && current.targetId === defenderId ? current.streak + 1 : 1;
      return { ...prev, [attackerColor]: { targetId: defenderId, streak } };
    });
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
  function performMove(currentFen, currentRegistry, currentHumanColor, currentCombatLog, from, to, promotion) {
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

    const result = resolveCombatMove({ fen: currentFen, registry: currentRegistry, from, to, promotion, focusStreak: streak });
    if (!result) return;

    setSelected(null);
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
          },
        ];
    setCombatLog(updatedLog);
    // Si el modo auto-subida está activo, la pieza que acaba de bancar XP
    // (el atacante si conectó, el defensor si esquivó) lo gasta sola, de a
    // pares fuerza+velocidad — así funcionaba antes de que hubiera compra
    // manual.
    let finalRegistry = result.registry;
    if (autoLevelUpEnabled && result.isCapture) {
      const xpSquare = result.hit ? to : capturedSquareFor(result.applied);
      if (finalRegistry[xpSquare]) {
        finalRegistry = { ...finalRegistry, [xpSquare]: autoLevelUp(finalRegistry[xpSquare]) };
      }
    }
    setRegistry(finalRegistry);

    if (result.isCapture && result.attacker && result.defender) {
      updateFocusAfterAttack(result.attacker.color, result.defender.id, result.hit);
    }

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

    if (chessAfter.isGameOver()) {
      const isWin = chessAfter.isCheckmate() && chessAfter.turn() !== currentHumanColor;
      const isLoss = chessAfter.isCheckmate() && chessAfter.turn() === currentHumanColor;
      const outcome = isWin ? 'win' : isLoss ? 'loss' : 'draw';
      if (isWin) playSuccessSound();
      const nextRoster = saveSurvivorsToRoster(finalRegistry, roster, currentHumanColor, outcome);
      saveRoster(nextRoster);
      setRoster(nextRoster);

      // A propósito NO actualiza el rating tipo ELO: acá el resultado
      // depende bastante del dado de las capturas (una jugada objetivamente
      // buena puede fallar el % y no conectar), así que el resultado final
      // no es una señal limpia de nivel de ajedrez — el mismo motivo por el
      // que "Partida de práctica" tampoco cuenta (ahí distorsiona al revés,
      // con pistas gratis). Para medir la calidad real de tus decisiones en
      // Combate está la "pista inversa" del historial, que analiza el
      // intento sin el ruido del dado.

      const battleRecord = {
        id: `combat-${Date.now()}`,
        date: new Date().toISOString(),
        difficulty,
        humanColor: currentHumanColor,
        outcome,
        log: updatedLog,
      };
      saveCombatBattle(battleRecord);

      // Victoria perfecta: ganaste sin perder ninguna de tus 16 piezas.
      const survivorCount = Object.values(finalRegistry).filter((p) => p.color === currentHumanColor).length;
      checkAchievements({ combatFlawlessWin: isWin && survivorCount === 16 });

      setBattleRecap({
        survivorCount,
        totalCount: 16,
        xpGained: Math.max(0, nextRoster.combatXp - roster.combatXp),
        record: battleRecord,
      });

      setPhase('over');
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

  function handleSquareClick(square) {
    if (phase !== 'battle' || busy || localChess.turn() !== humanColor) return;

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
      const mustSucceed = localChess.inCheck();
      const streak = attacker && defender ? currentFocusStreak(attacker.color, defender.id) : 0;
      const chance = mustSucceed ? 1 : hitChance(attacker, defender, streak);
      setPendingAttack({ from, to, promotion, attacker, defender, chance });
      setSelected(null);
      return;
    }
    performMove(fen, registry, humanColor, combatLog, from, to, promotion);
  }

  function confirmAttack() {
    if (!pendingAttack) return;
    const { from, to, promotion } = pendingAttack;
    setPendingAttack(null);
    performMove(fen, registry, humanColor, combatLog, from, to, promotion);
  }

  function cancelAttack() {
    setPendingAttack(null);
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
      const virtualPiece = { type: key.split('-')[0], ...saved };
      const updated = buyStatPoint(virtualPiece, stat);
      if (!updated) return prev;
      const next = {
        ...prev,
        pieces: {
          ...prev.pieces,
          [key]: { strengthPoints: updated.strengthPoints, speedPoints: updated.speedPoints, bankedXp: updated.bankedXp, alive: true },
        },
      };
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

  if (phase === 'setup') {
    return (
      <div className="menu combat-setup">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section">
          <span className="eyebrow">Modo combate</span>
          <h2 style={{ marginTop: '0.35rem' }}>Ajedrez con niveles y esquive</h2>
          <p className="hint-text">
            Es ajedrez normal, con una vuelta: cuando intentas capturar una pieza, primero ves el % de acierto
            y confirmas si te compensa el riesgo. Si falla, tu pieza esquivó — no pasa nada, pero pierdes el
            turno (y la que esquivó banca algo de XP por sobrevivir). Capturar también banca XP, que se puede
            gastar en fuerza o velocidad — automático o a mano, según la opción de abajo. Atacar sin haberte
            movido de tu casilla de partida da un bono ("en reserva"), y seguir atacando al mismo objetivo varias
            veces seguidas también suma bono. Las piezas que lleguen vivas al final de la partida guardan su
            progreso para la próxima batalla — las que caigan, tienen una única ventana para revivirlas
            (gastando "XP de combate", una moneda aparte que se gana al terminar cada partida) antes de que
            empieces la siguiente: si no las revives a tiempo, se pierden para siempre y vuelven a nivel 1. El
            rey nunca esquiva y siempre acierta cuando ataca, y tampoco gana ni gasta XP: el jaque mate sigue
            siendo 100% seguro, como en el ajedrez de siempre.
          </p>
        </div>

        <div className="menu-section">
          <h2>Dificultad de la CPU</h2>
          <p className="hint-text" style={{ marginBottom: '0.6rem' }}>
            Automática, según cómo te ve la CPU — no se elige a mano en Combate.
          </p>
          <div className="difficulty-slider-row">
            <div className="difficulty-slider" style={{ background: 'transparent', pointerEvents: 'none', flex: 1 }}>
              <div
                style={{
                  height: '4px',
                  borderRadius: '2px',
                  background: 'linear-gradient(90deg, var(--success), var(--brass) 50%, var(--danger))',
                  width: '100%',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: `${difficulty}%`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: 'var(--parchment)',
                    border: '2px solid var(--ink)',
                  }}
                />
              </div>
            </div>
            <div className="difficulty-readout">
              <span className="difficulty-number">{difficulty}</span>
              <span className="difficulty-word">{ratingInfo.tier.label}</span>
            </div>
          </div>
        </div>

        <div className="menu-section">
          <h2>Color</h2>
          <ColorSelector value={colorChoice} onChange={setColorChoice} />
        </div>

        <div className="menu-section">
          <h2>Subida de nivel</h2>
          <label className="auto-level-toggle">
            <input
              type="checkbox"
              checked={autoLevelUpEnabled}
              onChange={(e) => setAutoLevelUpEnabled(e.target.checked)}
            />
            <span>Auto-subida de nivel</span>
          </label>
          <p className="hint-text" style={{ marginTop: '0.4rem' }}>
            {autoLevelUpEnabled
              ? 'Activada: cada pieza gasta su XP sola, comprando fuerza y velocidad en pareja apenas alcanza. Simple, sin decisiones.'
              : 'Desactivada: eliges en qué gastar el XP de cada pieza (toca dos veces cualquier pieza tuya para hacerlo). Más control, pero hay que estar pendiente.'}
          </p>
        </div>

        <div className="menu-section">
          <h2>Tu ejército</h2>
          {rosterCount > 0 ? (
            <p className="hint-text">
              Tienes {rosterCount} pieza{rosterCount === 1 ? '' : 's'} propia{rosterCount === 1 ? '' : 's'} con
              progreso guardado de batallas anteriores — van a arrancar ya reforzadas sea cual sea el color que
              te toque esta vez. Las que capturen o sobrevivan en esta partida siguen sumando XP; las que
              pierdas, vuelven a empezar de cero (salvo que las revivas).
            </p>
          ) : (
            <p className="hint-text">
              Todavía no tienes progreso guardado. Las piezas que sobrevivan esta partida van a arrancar la
              próxima ya con lo que hayas invertido en ellas.
            </p>
          )}
          {deadCount > 0 && (
            <p className="hint-text" style={{ marginTop: '0.4rem' }}>
              {deadCount} pieza{deadCount === 1 ? '' : 's'} caída{deadCount === 1 ? '' : 's'} — revívelas ahora
              gastando XP de combate (tienes {roster.combatXp}) desde "Ver tu ejército", o se pierden para
              siempre en cuanto arranques la próxima batalla.
            </p>
          )}
          <button
            type="button"
            className="secondary-btn"
            style={{ width: '100%', marginTop: '0.6rem' }}
            onClick={() => setShowArmy(true)}
          >
            Ver tu ejército {roster.combatXp > 0 ? `(${roster.combatXp} XP de combate)` : ''}
          </button>
          {onHistory && (
            <button
              type="button"
              className="secondary-btn"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={onHistory}
            >
              Ver mis batallas
            </button>
          )}
          {rosterCount > 0 && (
            <button
              type="button"
              className="secondary-btn"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={handleResetRoster}
            >
              Reiniciar progreso de piezas
            </button>
          )}
        </div>

        <button className="primary-btn" style={{ width: '100%' }} onClick={handleStartBattleClick}>
          Empezar combate
        </button>

        {showExpireWarning && (
          <div className="modal-backdrop" onClick={() => setShowExpireWarning(false)}>
            <div className="attack-confirm-card" onClick={(e) => e.stopPropagation()}>
              <p className="attack-confirm-title">
                Tienes {deadRosterEntries.length} pieza{deadRosterEntries.length === 1 ? '' : 's'} caída
                {deadRosterEntries.length === 1 ? '' : 's'} sin revivir
                {' '}({deadRosterEntries.map(([key]) => BASE_STATS[key.split('-')[0]].name).join(', ')}).
                Si empiezas ahora, se pierden para siempre.
              </p>
              <div className="attack-confirm-buttons">
                <button
                  className="secondary-btn"
                  onClick={() => { setShowExpireWarning(false); startBattle(); }}
                >
                  Empezar igual
                </button>
                <button
                  className="primary-btn"
                  onClick={() => { setShowExpireWarning(false); setShowArmy(true); }}
                >
                  Ir a revivir
                </button>
              </div>
            </div>
          </div>
        )}

        {showArmy && (
          <ArmyScreen roster={roster} onBuy={handleBuyRosterStat} onRevive={handleReviveRosterPiece} onClose={() => setShowArmy(false)} />
        )}
      </div>
    );
  }

  const status = localChess.isCheckmate()
    ? 'checkmate'
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
  const statusText = busy
    ? 'La CPU está pensando…'
    : statusLabel || (localChess.turn() === humanColor ? 'Tu turno' : 'Turno de la CPU');

  return (
    <div>
      <div className="game-layout">
        <div className="board-column">
          <div className={`status-line ${statusClass}`}>{statusText}</div>
          <Board
            fen={fen}
            onSquareClick={handleSquareClick}
            onSquareDoubleClick={handleSquareDoubleClick}
            selectedSquare={selected}
            legalTargets={legalTargets}
            animate={pendingAnim}
            pieceLevels={pieceLevels}
            pieceXp={pieceXp}
            orientation={humanColor === 'b' ? 'black' : 'white'}
          />
          <div className="game-controls">
            <button className="secondary-btn" onClick={backToSetup}>Salir del combate</button>
          </div>
        </div>

        <aside className="notation-panel combat-log-panel">
          <div className="army-summary-line">
            <span>{armySummary.aliveCount} piezas en pie</span>
            <span>·</span>
            <span>nivel total <b>{armySummary.totalLevel}</b></span>
            {armySummary.totalXp > 0 && (
              <>
                <span>·</span>
                <span>XP sin gastar <b>{armySummary.totalXp}</b></span>
              </>
            )}
          </div>
          <h3>Registro de combate</h3>
          <div className="notation-list combat-log-list">
            {log.length === 0 && <p className="notation-empty">Todavía no hubo ninguna captura.</p>}
            {log.map((entry, i) => (
              <p key={i} className={`combat-log-entry ${entry.tone}`}>{entry.text}</p>
            ))}
          </div>
          <div className="combat-legend">
            <p className="hint-text"><b>Fuerza</b>: ayuda a acertar el ataque.</p>
            <p className="hint-text"><b>Velocidad</b>: ayuda a esquivar cuando te atacan.</p>
            <p className="hint-text">Toca dos veces una pieza tuya para gastar su XP en fuerza o velocidad.</p>
            <p className="hint-text">La insignia verde (arriba a la izquierda) avisa que a esa pieza le quedó XP sin gastar.</p>
            <p className="hint-text" style={{ marginTop: '0.3rem' }}>
              <span className="legend-swatch bronze" /> nivel 2-3 · <span className="legend-swatch silver" /> nivel 4-5 ·{' '}
              <span className="legend-swatch gold" /> nivel 6+
            </p>
          </div>
        </aside>
      </div>

      {phase === 'over' && (
        <div className="endgame-banner">
          <h2>{statusLabel}</h2>
          <p>
            {status === 'checkmate'
              ? localChess.turn() === humanColor ? 'Ganó la CPU.' : '¡Ganaste el combate!'
              : 'Terminó en tablas.'}
          </p>
          {battleRecap && (
            <p className="hint-text combat-recap-line">
              {battleRecap.survivorCount}/{battleRecap.totalCount} piezas sobrevivieron
              {battleRecap.xpGained > 0 ? ` · +${battleRecap.xpGained} XP de combate` : ''}
            </p>
          )}
          <button className="primary-btn" onClick={backToSetup}>Volver a jugar</button>
          {battleRecap && onViewBattle && (
            <button
              type="button"
              className="secondary-btn"
              style={{ marginTop: '0.6rem' }}
              onClick={() => onViewBattle(battleRecap.record)}
            >
              Ver análisis de esta batalla →
            </button>
          )}
        </div>
      )}

      {pendingPromotion && <PromotionModal onChoose={choosePromotion} />}
      {pendingAttack && (
        <AttackConfirmModal
          attacker={pendingAttack.attacker}
          defender={pendingAttack.defender}
          chance={pendingAttack.chance}
          onConfirm={confirmAttack}
          onCancel={cancelAttack}
        />
      )}
      {infoPiece && (
        <PieceInfoModal
          piece={infoPiece}
          canManage={infoPiece.color === humanColor}
          onBuy={handleBuyStat}
          onClose={() => setInfoSquare(null)}
        />
      )}
    </div>
  );
}
