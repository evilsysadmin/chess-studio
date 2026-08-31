import { useEffect, useRef, useState } from 'react';
import { duckAmbientMusic } from '../sound.js';
import { TRAIL_SPRITES } from '../pawnTrailblazerSprites.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import {
  TRAIL_COMBO_WINDOW_MS,
  TRAIL_LANES,
  TRAIL_POWER_DURATION_MS,
  TRAIL_PROMOTION_BONUS,
  trailBishopParryReady,
  trailBishopTargetLane,
  trailComboAfterCapture,
  trailComboMultiplier,
  trailDuelDecay,
  trailDuelDirection,
  trailDuelPress,
  trailEnemyCapturePoints,
  trailEnemyTypeForDistance,
  trailKnightJumpLane,
  trailPowerLabel,
  trailPowerLane,
  trailPromotionCrossed,
  trailSectorForDistance,
  trailSpeedForDistance,
} from '../pawnTrailblazer.js';
import './PawnTrailblazer.css';

const MAX_DEPTH = 34;
const COLLISION_Z = 1.25;
const CAPTURE_WINDOW = 4.2;
const POWER_TYPES = ['rook', 'bishop', 'queen'];
const BISHOP_AIM_Z = 16;
const BISHOP_AIM_MS = 700;

function createGame() {
  return {
    phase: 'ready',
    lane: 2,
    lives: 3,
    score: 0,
    distance: 0,
    speed: 5.2,
    objects: [],
    spawnIn: 5.5,
    nextId: 1,
    power: null,
    powerUntil: 0,
    duel: null,
    slashUntil: 0,
    flashUntil: 0,
    combo: 0,
    comboUntil: 0,
    lastCaptureAt: 0,
    captures: 0,
    sectorKey: trailSectorForDistance(0).key,
    promotionRefused: false,
    promotionUntil: 0,
    toast: 'Nací peón. Siempre seré peón.',
    toastUntil: 0,
    lastTime: 0,
  };
}

function objectLane(game, preferCurrent = false) {
  if (preferCurrent) return game.lane;
  return Math.floor(Math.random() * TRAIL_LANES);
}

function spawnObject(game) {
  const roll = Math.random();
  let kind = 'enemy';
  if (roll < 0.19) kind = 'power';
  else if (roll > 0.7) kind = 'obstacle';

  let lane = objectLane(game, kind === 'power');
  if (kind === 'obstacle' && !game.power && lane === game.lane) {
    lane = (lane + 1 + Math.floor(Math.random() * (TRAIL_LANES - 1))) % TRAIL_LANES;
  }
  if (kind === 'enemy' && Math.random() < 0.55) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    lane = Math.max(0, Math.min(TRAIL_LANES - 1, game.lane + dir));
  }

  game.objects.push({
    id: game.nextId++,
    kind,
    lane,
    z: MAX_DEPTH,
    power: kind === 'power' ? POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)] : null,
    enemyType: kind === 'enemy' ? trailEnemyTypeForDistance(game.distance, Math.random()) : null,
    jumped: false,
    aimed: false,
    fired: false,
    aimLane: null,
    aimUntil: 0,
  });
  game.spawnIn = Math.max(3.25, 4.35 + Math.random() * 3.1 - game.distance / 900);
}

function removeObject(game, id) {
  game.objects = game.objects.filter((item) => item.id !== id);
}

function nearestObject(game, lane, kind = null) {
  return game.objects
    .filter((item) => item.lane === lane && item.z > 0.35 && item.z < CAPTURE_WINDOW && (!kind || item.kind === kind))
    .sort((a, b) => a.z - b.z)[0] || null;
}

function setToast(game, text, now, duration = 1200) {
  game.toast = text;
  game.toastUntil = now + duration;
}

function breakCombo(game) {
  game.combo = 0;
  game.comboUntil = 0;
  game.lastCaptureAt = 0;
}

function loseLife(game, now, message) {
  game.lives -= 1;
  game.flashUntil = now + 420;
  game.duel = null;
  breakCombo(game);
  game.phase = game.lives <= 0 ? 'gameover' : 'running';
  setToast(game, game.lives <= 0 ? 'Fin de maniobras. Otra vez.' : message, now, 1600);
}

function finishCapture(game, enemy, targetLane, now, points = trailEnemyCapturePoints(enemy?.enemyType)) {
  removeObject(game, enemy.id);
  game.lane = targetLane;
  game.combo = trailComboAfterCapture(game.combo, game.lastCaptureAt, now);
  game.lastCaptureAt = now;
  game.comboUntil = now + TRAIL_COMBO_WINDOW_MS;
  game.captures += 1;
  const multiplier = trailComboMultiplier(game.combo);
  const awarded = Math.round(points * multiplier);
  game.score += awarded;
  game.slashUntil = now + 380;
  game.duel = null;
  game.phase = 'running';
  setToast(game, game.combo > 1 ? `COMBO x${game.combo} · +${awarded}` : `Captura · +${awarded}`, now, 1050);
}

function createArcadeMusic(kind) {
  if (typeof window === 'undefined') return () => {};
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return () => {};
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0.045;
  master.connect(ctx.destination);
  let step = 0;
  let timer = null;

  function tone(freq, when, duration, type = 'triangle', gainValue = 0.4) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(gainValue, when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.03);
  }

  function tick() {
    const now = ctx.currentTime + 0.03;
    if (kind === 'classical') {
      const line = [220, 261.63, 329.63, 392, 329.63, 293.66, 261.63, 246.94];
      tone(line[step % line.length], now, 0.42, 'triangle', 0.32);
      tone(line[(step + 4) % line.length] / 2, now, 0.55, 'sine', 0.18);
    } else {
      const riff = [82.41, 82.41, 98, 110, 82.41, 123.47, 110, 98];
      tone(riff[step % riff.length], now, 0.18, 'sawtooth', 0.34);
      if (step % 2 === 0) tone(riff[(step + 3) % riff.length] * 2, now + 0.08, 0.28, 'square', 0.12);
    }
    step += 1;
  }

  tick();
  timer = window.setInterval(tick, kind === 'classical' ? 360 : 220);
  return () => {
    if (timer) window.clearInterval(timer);
    void ctx.close().catch(() => {});
  };
}

export default function PawnTrailblazer({ onExit }) {
  useEscapeToClose(onExit);
  const phaserHostRef = useRef(null);
  const rendererRef = useRef(null);
  const gameRef = useRef(createGame());
  const musicStopRef = useRef(() => {});
  const musicRef = useRef('synthmetal');
  const reducedMotionRef = useRef(false);
  const [hud, setHud] = useState(() => ({ ...createGame() }));
  const [music, setMusic] = useState('synthmetal');
  const [rendererName, setRendererName] = useState('CARGANDO');
  const [rendererError, setRendererError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let renderer = null;
    const host = phaserHostRef.current;
    if (!host) return undefined;

    void import('../pawnTrailblazerPhaser.js')
      .then(({ createPawnTrailblazerRenderer }) => {
        if (cancelled) return;
        renderer = createPawnTrailblazerRenderer(host, {
          onReady: (backend) => {
            if (!cancelled) setRendererName(`PHASER 3 · ${backend}`);
          },
        });
        rendererRef.current = renderer;
        renderer.sync(gameRef.current, performance.now(), reducedMotionRef.current);
      })
      .catch(() => {
        if (!cancelled) {
          setRendererName('PHASER 3 · ERROR');
          setRendererError('No se ha podido iniciar el renderer Phaser.');
        }
      });

    return () => {
      cancelled = true;
      renderer?.destroy();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const sync = () => { reducedMotionRef.current = Boolean(media?.matches); };
    sync();
    media?.addEventListener?.('change', sync);
    return () => media?.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => () => {
    musicStopRef.current();
    duckAmbientMusic(false);
  }, []);

  useEffect(() => {
    let frame = 0;
    let hudAt = 0;

    function update(now) {
      const game = gameRef.current;
      if (!game.lastTime) game.lastTime = now;
      const dt = Math.min(0.05, Math.max(0, (now - game.lastTime) / 1000));
      game.lastTime = now;

      if (game.power && now >= game.powerUntil) game.power = null;
      if (game.combo && now >= game.comboUntil) breakCombo(game);

      if (game.phase === 'running') {
        const previousDistance = game.distance;
        game.speed = trailSpeedForDistance(game.distance);
        game.distance += game.speed * dt;
        game.score += game.speed * dt * 2;

        const sector = trailSectorForDistance(game.distance);
        if (sector.key !== game.sectorKey) {
          game.sectorKey = sector.key;
          setToast(game, `SECTOR ${sector.code} · ${sector.name} · ${sector.toast}`, now, 1600);
        }
        if (trailPromotionCrossed(previousDistance, game.distance, game.promotionRefused)) {
          game.promotionRefused = true;
          game.promotionUntil = now + 1900;
          game.score += TRAIL_PROMOTION_BONUS;
          game.flashUntil = now + 320;
          setToast(game, `PROMOCIÓN A DAMA · RECHAZADA. +${TRAIL_PROMOTION_BONUS}`, now, 1900);
        }

        game.spawnIn -= game.speed * dt;
        if (game.spawnIn <= 0) spawnObject(game);

        for (const item of [...game.objects]) {
          item.z -= game.speed * dt;
          if (item.kind !== 'enemy') continue;

          if (item.enemyType === 'knight' && !item.jumped && item.z < 12) {
            item.lane = trailKnightJumpLane(item.lane, game.lane);
            item.jumped = true;
          }

          if (item.enemyType === 'bishop' && !item.aimed && item.z < BISHOP_AIM_Z) {
            item.aimed = true;
            item.aimLane = trailBishopTargetLane(item.lane, game.lane);
            item.aimUntil = now + BISHOP_AIM_MS;
            setToast(game, 'ALFIL · diagonal marcada. Muévete o para el disparo.', now, 900);
          } else if (item.enemyType === 'bishop' && item.aimed && !item.fired && now >= item.aimUntil) {
            item.fired = true;
            if (game.lane === item.aimLane) {
              loseLife(game, now, 'El alfil te ha cosido en diagonal. Eso sí estaba anunciado.');
            } else {
              setToast(game, 'El disparo del alfil ha pasado de largo.', now, 850);
            }
          }
        }

        for (const item of [...game.objects].sort((a, b) => a.z - b.z)) {
          if (item.z > COLLISION_Z || item.lane !== game.lane) continue;
          if (item.kind === 'power') {
            game.power = item.power;
            game.powerUntil = now + TRAIL_POWER_DURATION_MS;
            game.score += 80;
            removeObject(game, item.id);
            setToast(game, `${trailPowerLabel(item.power)} · movimiento desbloqueado`, now, 1400);
          } else if (item.kind === 'enemy' && item.enemyType === 'pawn') {
            game.phase = 'duel';
            game.duel = { enemyId: item.id, meter: 24, timeLeft: 2.6, direction: game.lane === TRAIL_LANES - 1 ? -1 : 1 };
            setToast(game, '¡FRONTAL! Machaca ESPACIO.', now, 1000);
          } else if (item.kind === 'enemy' && item.enemyType === 'knight') {
            removeObject(game, item.id);
            loseLife(game, now, 'El caballo ha saltado sobre tu línea. Previsible después de verlo.');
          } else if (item.kind === 'enemy' && item.enemyType === 'bishop') {
            removeObject(game, item.id);
            loseLife(game, now, 'El alfil ha cerrado la diagonal. Muy litúrgico todo.');
          } else if (item.kind === 'enemy' && item.enemyType === 'rook') {
            removeObject(game, item.id);
            loseLife(game, now, 'Una torre de frente. Ni siquiera tú eres tan cabezón, Matthias.');
          } else {
            removeObject(game, item.id);
            loseLife(game, now, 'Eso era un obstáculo, general.');
          }
        }
        game.objects = game.objects.filter((item) => item.z > -2);
      } else if (game.phase === 'duel' && game.duel) {
        game.duel.meter = trailDuelDecay(game.duel.meter, dt);
        game.duel.timeLeft -= dt;
        if (game.duel.timeLeft <= 0) {
          const enemy = game.objects.find((item) => item.id === game.duel?.enemyId);
          if (enemy) removeObject(game, enemy.id);
          loseLife(game, now, 'El otro peón te ha echado para atrás. Vergüenza administrativa.');
        }
      }

      rendererRef.current?.sync(game, now, reducedMotionRef.current);

      if (now - hudAt > 90) {
        hudAt = now;
        setHud({
          phase: game.phase,
          lane: game.lane,
          lives: game.lives,
          score: Math.floor(game.score),
          distance: Math.floor(game.distance),
          speed: game.speed,
          power: game.power,
          powerLeft: game.power ? Math.max(0, game.powerUntil - now) : 0,
          combo: game.combo,
          captures: game.captures,
          duel: game.duel ? { ...game.duel } : null,
          sector: trailSectorForDistance(game.distance),
          promotionActive: now < game.promotionUntil,
          toast: now < game.toastUntil || game.phase === 'ready' || game.phase === 'gameover' ? game.toast : '',
        });
      }
      frame = requestAnimationFrame(update);
    }

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (!['ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(event.key)) return;
      event.preventDefault();
      const game = gameRef.current;
      const now = performance.now();
      if (game.phase === 'ready' || game.phase === 'gameover') {
        if (event.key === ' ' || event.key === 'Spacebar') startRun();
        return;
      }

      if (game.phase === 'running' && (event.key === ' ' || event.key === 'Spacebar')) {
        const sniper = game.objects.find((item) => (
          item.kind === 'enemy'
          && item.enemyType === 'bishop'
          && item.aimed
          && !item.fired
          && item.aimLane === game.lane
        ));
        if (sniper && trailBishopParryReady(sniper.aimUntil, now)) {
          sniper.fired = true;
          game.score += 120;
          game.slashUntil = now + 360;
          setToast(game, 'PARADA · +120. Nein.', now, 900);
        } else if (sniper) {
          setToast(game, 'Aún no. Espera el destello del alfil.', now, 700);
        }
        return;
      }

      if (game.phase === 'duel' && game.duel) {
        if (event.key === 'ArrowLeft') game.duel.direction = trailDuelDirection(game.lane, -1);
        else if (event.key === 'ArrowRight') game.duel.direction = trailDuelDirection(game.lane, 1);
        else {
          game.duel.meter = trailDuelPress(game.duel.meter);
          if (game.duel.meter >= 100) {
            const enemy = game.objects.find((item) => item.id === game.duel.enemyId);
            if (enemy) {
              const direction = trailDuelDirection(game.lane, game.duel.direction);
              finishCapture(game, enemy, game.lane + direction, now);
            }
          }
        }
        return;
      }
      if (game.phase !== 'running' || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;

      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      const targetLane = game.lane + direction;
      if (targetLane < 0 || targetLane >= TRAIL_LANES) return;

      if (game.power) {
        const nextLane = trailPowerLane({ lane: game.lane, direction, power: game.power });
        const victim = nearestObject(game, nextLane);
        if (victim && (game.power === 'bishop' || game.power === 'queen')) {
          if (victim.kind === 'enemy') finishCapture(game, victim, nextLane, now);
          else {
            removeObject(game, victim.id);
            game.score += 70;
            game.slashUntil = now + 250;
            game.lane = nextLane;
          }
          return;
        }
        game.lane = nextLane;
        return;
      }

      const enemy = nearestObject(game, targetLane, 'enemy');
      if (enemy) {
        finishCapture(game, enemy, targetLane, now);
      } else {
        setToast(game, 'Nein. Un peón no se mueve de lado.', now, 900);
      }
    }

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function startRun() {
    musicStopRef.current();
    duckAmbientMusic(true);
    musicStopRef.current = createArcadeMusic(musicRef.current);
    const game = createGame();
    game.phase = 'running';
    game.toast = 'Vorwärts.';
    game.toastUntil = performance.now() + 1100;
    game.lastTime = performance.now();
    gameRef.current = game;
    rendererRef.current?.sync(game, game.lastTime, reducedMotionRef.current);
    setHud({ ...game });
  }

  function switchMusic(next) {
    setMusic(next);
    musicRef.current = next;
    if (gameRef.current.phase === 'running' || gameRef.current.phase === 'duel') {
      musicStopRef.current();
      musicStopRef.current = createArcadeMusic(next);
    }
  }

  function pressControl(key) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  const hudSector = hud.sector || trailSectorForDistance(hud.distance || 0);
  const powerSeconds = hud.power ? Math.max(1, Math.ceil((hud.powerLeft || 0) / 1000)) : 0;
  const duelMeter = Math.max(0, Math.min(100, hud.duel?.meter || 0));

  return (
    <div className="pawn-trailblazer" data-pawn-trailblazer="true">
      <div className="pawn-trailblazer-head">
        <div>
          <span className="section-label">EXPERIMENTO ARCADE · PHASER 3</span>
          <h2>Pawn Trailblazer</h2>
          <p>Matthias avanza solo. Peones forcejean, caballos saltan, alfiles marcan diagonales y las torres te pasan por encima si las recibes de frente. Captura en diagonal para encadenar combo.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onExit}>← Experimentos</button>
      </div>

      <div className="pawn-trailblazer-shell">
        <div className="pawn-trailblazer-hud" aria-live="polite">
          <span>VIDAS <b>{'♥'.repeat(Math.max(0, hud.lives || 0)) || '—'}</b></span>
          <span>DISTANCIA <b>{hud.distance || 0} m</b></span>
          <span>PUNTOS <b>{hud.score || 0}</b></span>
          <span>COMBO <b>{hud.combo > 1 ? `x${hud.combo}` : '—'}</b></span>
          <span>FORMA <b>{trailPowerLabel(hud.power)}{hud.power ? ` · ${powerSeconds}s` : ''}</b></span>
        </div>

        <div className="pawn-trailblazer-stage">
          <div
            ref={phaserHostRef}
            className="pawn-trailblazer-phaser"
            data-pawn-trailblazer-renderer="phaser"
            aria-label="Corredor pseudo 3D de Pawn Trailblazer renderizado con Phaser 3"
          />
          <div className="pawn-trailblazer-stage-sector" aria-label={`Sector ${hudSector.code}: ${hudSector.name}`}>
            <span>SECTOR {hudSector.code}</span>
            <b>{hudSector.name}</b>
          </div>
          <div className="pawn-trailblazer-stage-power" aria-label={`Forma ${trailPowerLabel(hud.power)}`}>
            <span>FORMA</span>
            <b>{trailPowerLabel(hud.power)}</b>
            <small>{hud.power ? `${powerSeconds}s` : 'BASE'}</small>
          </div>
          {rendererError && <div className="pawn-trailblazer-renderer-error" role="alert">{rendererError}</div>}
          {hud.phase === 'duel' && hud.duel && (
            <div className="pawn-trailblazer-duel" role="status" aria-label="Forcejeo contra peón rival">
              <strong>EMPUJA AL PEÓN · ESPACIO</strong>
              <div className="pawn-trailblazer-duel-meter" aria-hidden="true">
                <span style={{ width: `${duelMeter}%` }} />
              </div>
            </div>
          )}
          {(hud.phase === 'ready' || hud.phase === 'gameover') && (
            <div className="pawn-trailblazer-overlay">
              <img src={TRAIL_SPRITES.matthiasRun} alt="Matthias corredor" />
              <span>{hud.phase === 'gameover' ? 'FIN DE MANIOBRAS' : 'GENERAL MATTHIAS VON LOPSTEIN'}</span>
              <strong>{hud.phase === 'gameover' ? `${hud.distance || 0} m · ${hud.score || 0} puntos · ${hud.captures || 0} capturas` : 'Nací peón. Siempre seré peón.'}</strong>
              <button type="button" className="primary-btn" onClick={startRun}>{hud.phase === 'gameover' ? 'Otra vez' : 'Iniciar carrera'}</button>
              <small>También puedes pulsar ESPACIO.</small>
            </div>
          )}
          {hud.promotionActive && hud.phase !== 'ready' && hud.phase !== 'gameover' && (
            <div className="pawn-trailblazer-promotion" role="status" aria-label="Promoción a dama rechazada por Matthias">
              <span aria-hidden="true">♛</span>
              <small>PROMOCIÓN DISPONIBLE</small>
              <strong>NEIN.</strong>
              <b>Matthias sigue siendo peón · +{TRAIL_PROMOTION_BONUS}</b>
            </div>
          )}
          {hud.toast && hud.phase !== 'ready' && hud.phase !== 'gameover' && <div className="pawn-trailblazer-toast">{hud.toast}</div>}
          {hud.phase !== 'ready' && hud.phase !== 'gameover' && (
            <div className={`pawn-trailblazer-touch-controls ${hud.phase === 'duel' ? 'is-duel' : ''}`} aria-label="Controles táctiles">
              <button type="button" aria-label="Mover o capturar a la izquierda" onClick={() => pressControl('ArrowLeft')}>
                <span aria-hidden="true">←</span>
                <small>IZQ</small>
              </button>
              <button type="button" className="pawn-trailblazer-touch-action" aria-label={hud.phase === 'duel' ? 'Empujar al peón rival' : 'Acción'} onClick={() => pressControl(' ')}>
                <span aria-hidden="true">⚔</span>
                <small>{hud.phase === 'duel' ? 'EMPUJA' : 'ACCIÓN'}</small>
              </button>
              <button type="button" aria-label="Mover o capturar a la derecha" onClick={() => pressControl('ArrowRight')}>
                <span aria-hidden="true">→</span>
                <small>DER</small>
              </button>
            </div>
          )}
        </div>

        <div className="pawn-trailblazer-controls">
          <div><kbd>←</kbd><kbd>→</kbd><span>Captura diagonal. Con powerup, maniobra.</span></div>
          <div><kbd>ESPACIO</kbd><span>Forcejea contra peones o para el disparo de un alfil al final de su carga.</span></div>
          <div className="pawn-trailblazer-music"><span>BSO</span><button type="button" className={music === 'synthmetal' ? 'active' : ''} onClick={() => switchMusic('synthmetal')}>Synthmetal</button><button type="button" className={music === 'classical' ? 'active' : ''} onClick={() => switchMusic('classical')}>Clásica</button></div>
        </div>
        <p className="pawn-trailblazer-note">Renderer {rendererName}. Phaser se carga sólo al entrar en este experimento; reglas, puntuación y progresión siguen aisladas del rating competitivo.</p>
      </div>
    </div>
  );
}
