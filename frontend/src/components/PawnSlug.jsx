import { useEffect, useRef, useState } from 'react';
import { pawnSlugWeaponUpgradeForLevel } from '../pawnSlug.js';
import {
  PAWN_SLUG_CONTROL_ACTIONS,
  PAWN_SLUG_CONTROL_LABELS,
  PAWN_SLUG_DEFAULT_KEYMAP,
  loadPawnSlugSettings,
  pawnSlugControlActionForCode,
  pawnSlugEngineAction,
  pawnSlugKeyLabel,
  remapPawnSlugKey,
  savePawnSlugSettings,
} from '../pawnSlugControls.js';
import { getAmbientVolume, isFxMuted, setAmbientVolume, setFxMuted } from '../sound.js';
import PawnSlugModelArmory from './PawnSlugModelArmory.jsx';
import PawnSlugTouchSurface from './PawnSlugTouchSurface.jsx';
import './PawnSlug.css';
import './PawnSlugArsenal.css';
import './PawnSlugSettings.css';

const INITIAL_WEAPONS = Object.freeze([
  Object.freeze({ id: 'pistol', slot: 1, shortLabel: 'PST', label: 'Dienstpistole', current: true, unlocked: true, ammo: null }),
  Object.freeze({ id: 'machinegun', slot: 2, shortLabel: 'MG', label: 'MG-42 de bolsillo', current: false, unlocked: false, ammo: 0 }),
  Object.freeze({ id: 'shotgun', slot: 3, shortLabel: 'SG', label: 'Escopeta diplomática', current: false, unlocked: false, ammo: 0 }),
  Object.freeze({ id: 'panzerfaust', slot: 4, shortLabel: 'PZF', label: 'Panzerfaust', current: false, unlocked: false, ammo: 0 }),
]);

const INITIAL_HUD = Object.freeze({
  phase: 'ready',
  hp: 100,
  maxHp: 100,
  level: 1,
  xp: 0,
  xpProgress: 0,
  xpToNext: 120,
  lives: 3,
  weapon: 'pistol',
  weaponLabel: 'Dienstpistole',
  ammo: null,
  weapons: INITIAL_WEAPONS,
  weaponModels: [],
  grenades: 4,
  credits: 0,
  score: 0,
  combo: 0,
  progress: 0,
  midBossHp: null,
  midBossMaxHp: null,
  midBossLabel: null,
  bossHp: null,
  bossMaxHp: null,
  toast: 'Vorwärts. Si algo se mueve, probablemente ha tomado una mala decisión.',
  missionTime: 0,
});

const LEGACY_GAMEPLAY_CODES = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'KeyA', 'KeyD', 'KeyW', 'KeyS',
  'Space', 'Enter', 'KeyZ', 'KeyJ', 'KeyX', 'KeyK',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
]);

function TouchButton({ action, label, glyph, send, className = '' }) {
  function press(event) {
    event.preventDefault();
    send(action, true);
  }
  function release(event) {
    event.preventDefault();
    send(action, false);
  }
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span aria-hidden="true">{glyph}</span>
      <small>{label}</small>
    </button>
  );
}

function percent(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
}

export default function PawnSlug({ onExit }) {
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const pendingRef = useRef([]);
  const settingsRef = useRef(null);
  const settingsOpenRef = useRef(false);
  const bootRequestedRef = useRef(false);
  const [hud, setHud] = useState(INITIAL_HUD);
  const [rendererName, setRendererName] = useState('EN ESPERA');
  const [rendererError, setRendererError] = useState('');
  const [bootRequested, setBootRequested] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [remapAction, setRemapAction] = useState(null);
  const [remapError, setRemapError] = useState('');
  const [settings, setSettings] = useState(() => {
    const stored = loadPawnSlugSettings();
    const currentMusicVolume = getAmbientVolume();
    return {
      ...stored,
      masterVolume: 1,
      musicVolume: currentMusicVolume,
      sfxVolume: isFxMuted() ? 0 : stored.sfxVolume,
    };
  });
  settingsRef.current = settings;
  settingsOpenRef.current = settingsOpen;

  function send(action, pressed = true) {
    const engine = engineRef.current;
    if (engine) engine.input(action, pressed);
    else if (bootRequestedRef.current || action === 'action') pendingRef.current.push([action, pressed]);
  }

  function startOperation() {
    if (engineRef.current || hud.phase !== 'ready') {
      send('action', true);
      return;
    }
    if (bootRequestedRef.current) return;
    pendingRef.current.push(['action', true]);
    bootRequestedRef.current = true;
    setRendererError('');
    setRendererName('PREPARANDO OPERACIÓN…');
    setBootRequested(true);
  }

  function releaseGameplayInput() {
    for (const action of ['left', 'right', 'crouch', 'jump', 'fire', 'grenade']) send(action, false);
  }

  function applyAudio(next) {
    setAmbientVolume(next.musicVolume);
    setFxMuted(next.sfxVolume <= 0.001);
    engineRef.current?.setAudioMix?.({ sfxVolume: next.sfxVolume });
  }

  function commitSettings(nextValue, { audio = false } = {}) {
    const saved = savePawnSlugSettings(nextValue);
    settingsRef.current = saved;
    setSettings(saved);
    if (audio) applyAudio(saved);
    return saved;
  }

  function openSettings() {
    releaseGameplayInput();
    setRemapAction(null);
    setRemapError('');
    settingsOpenRef.current = true;
    engineRef.current?.setPaused?.(true);
    setSettingsOpen(true);
  }

  function closeSettings() {
    setRemapAction(null);
    setRemapError('');
    settingsOpenRef.current = false;
    engineRef.current?.setPaused?.(false);
    setSettingsOpen(false);
  }

  useEffect(() => {
    if (!bootRequested) return undefined;
    let cancelled = false;
    let engine = null;
    const host = hostRef.current;
    if (!host) return undefined;

    void import('../pawnSlugArmoryRuntime.js')
      .then(({ createPawnSlugArmoryGame }) => {
        if (cancelled) return;
        engine = createPawnSlugArmoryGame(host, {
          onReady: (name) => {
            if (!cancelled) setRendererName(name);
          },
          onHud: (nextHud) => {
            if (!cancelled) setHud(nextHud);
          },
        });
        engineRef.current = engine;
        engine.setAudioMix?.({ sfxVolume: settingsRef.current?.sfxVolume ?? 1 });
        engine.setPaused?.(settingsOpenRef.current);
        for (const [action, pressed] of pendingRef.current.splice(0)) engine.input(action, pressed);
      })
      .catch((error) => {
        console.error('Pawn Slug Three.js boot failed', error);
        if (!cancelled) {
          bootRequestedRef.current = false;
          pendingRef.current = [];
          setBootRequested(false);
          setRendererName('THREE.JS · ERROR');
          setRendererError('El motor 3D no ha podido arrancar. Matthias está redactando una queja muy alemana.');
        }
      });

    return () => {
      cancelled = true;
      engine?.destroy();
      if (engineRef.current === engine) engineRef.current = null;
      pendingRef.current = [];
    };
  }, [bootRequested]);

  useEffect(() => {
    function configuredAction(event) {
      const keymap = settingsRef.current?.keymap || PAWN_SLUG_DEFAULT_KEYMAP;
      return pawnSlugControlActionForCode(keymap, event.code);
    }

    function onKeyDownCapture(event) {
      if (remapAction) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.code === 'Escape') {
          setRemapAction(null);
          setRemapError('');
          return;
        }
        const result = remapPawnSlugKey(settingsRef.current?.keymap, remapAction, event.code);
        if (!result.ok) {
          const conflictLabel = result.conflictAction
            ? PAWN_SLUG_CONTROL_LABELS[result.conflictAction]
            : 'otro control';
          setRemapError(`${pawnSlugKeyLabel(event.code)} ya está asignada a ${conflictLabel}.`);
          return;
        }
        commitSettings({ ...settingsRef.current, keymap: result.keymap });
        setRemapAction(null);
        setRemapError('');
        return;
      }

      if (settingsOpen) {
        if (event.code === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeSettings();
        }
        return;
      }

      const action = configuredAction(event);
      if (action === 'pause' || event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        openSettings();
        return;
      }

      if (action) {
        const engineAction = pawnSlugEngineAction(action);
        if (!engineAction || engineAction === 'pause') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        send(engineAction, true);
        return;
      }

      if (LEGACY_GAMEPLAY_CODES.has(event.code)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    function onKeyUpCapture(event) {
      if (settingsOpen || remapAction) {
        if (LEGACY_GAMEPLAY_CODES.has(event.code)) event.stopImmediatePropagation();
        return;
      }
      const action = configuredAction(event);
      if (action && action !== 'pause') {
        const engineAction = pawnSlugEngineAction(action);
        if (engineAction) {
          event.preventDefault();
          event.stopImmediatePropagation();
          send(engineAction, false);
          return;
        }
      }
      if (LEGACY_GAMEPLAY_CODES.has(event.code)) event.stopImmediatePropagation();
    }

    window.addEventListener('keydown', onKeyDownCapture, true);
    window.addEventListener('keyup', onKeyUpCapture, true);
    return () => {
      window.removeEventListener('keydown', onKeyDownCapture, true);
      window.removeEventListener('keyup', onKeyUpCapture, true);
    };
  }, [remapAction, settingsOpen]);

  const bossPercent = hud.bossHp != null && hud.bossMaxHp
    ? Math.max(0, Math.min(100, (hud.bossHp / hud.bossMaxHp) * 100))
    : null;
  const midBossPercent = hud.midBossHp != null && hud.midBossMaxHp
    ? Math.max(0, Math.min(100, (hud.midBossHp / hud.midBossMaxHp) * 100))
    : null;
  const threatPercent = bossPercent ?? midBossPercent;
  const threatLabel = bossPercent != null ? 'PANZER-ROOK · KOMMANDANTENBURG' : hud.midBossLabel || 'STURM-BISCHOF';
  const healthPercent = Math.max(0, Math.min(100, ((hud.hp || 0) / Math.max(1, hud.maxHp || 100)) * 100));
  const xpPercent = Math.max(0, Math.min(100, (hud.xpProgress || 0) * 100));
  const missionPercent = Math.round((hud.progress || 0) * 100);
  const ammoText = hud.ammo == null ? '∞' : hud.ammo;
  const weaponUpgrade = pawnSlugWeaponUpgradeForLevel(hud.weapon, hud.level);
  const missionTime = `${String(Math.floor((hud.missionTime || 0) / 60)).padStart(2, '0')}:${String((hud.missionTime || 0) % 60).padStart(2, '0')}`;
  const overlay = hud.phase === 'ready' || hud.phase === 'gameover' || hud.phase === 'victory';
  const weapons = hud.weapons?.length ? hud.weapons : INITIAL_WEAPONS;
  const keymap = settings.keymap || PAWN_SLUG_DEFAULT_KEYMAP;

  return (
    <div className="pawn-slug" data-pawn-slug="true">
      <header className="pawn-slug-head">
        <div>
          <span className="section-label">ARCADE · THREE.JS · OPERACIÓN ABSOLUTAMENTE NO FIDE</span>
          <h2>Pawn Slug</h2>
          <p>Matthias ha encontrado armas de fuego. Cruza el sector, requisa arsenal enemigo, sube de nivel y conviértete en un problema administrativo para todo el tablero negro.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onExit}>← Experimentos</button>
      </header>

      <section className="pawn-slug-cabinet" aria-label="Pawn Slug arcade">
        <div className="pawn-slug-hud" aria-live="polite">
          <div className="pawn-slug-health">
            <span>MATTHIAS · NIVEL {hud.level}</span>
            <div className="pawn-slug-health-track" aria-label={`Salud ${hud.hp} de ${hud.maxHp}`}><i style={{ width: `${healthPercent}%` }} /></div>
            <b>{hud.hp}/{hud.maxHp}</b>
            <small className="pawn-slug-xp-label">XP</small>
            <div className="pawn-slug-xp-track" aria-label={`Experiencia ${Math.round(xpPercent)}% del nivel`}><i style={{ width: `${xpPercent}%` }} /></div>
            <small className="pawn-slug-xp-value">{hud.xpToNext == null ? 'MAX' : `${hud.xpToNext} para ascenso`}</small>
          </div>
          <div><span>VIDAS</span><b>{'♥'.repeat(Math.max(0, hud.lives || 0)) || '—'}</b></div>
          <div><span>ARMA</span><b>{hud.weaponLabel}</b><small>{weaponUpgrade.code} · {ammoText}</small></div>
          <div><span>POWER-UP</span><b>{hud.grenades}</b></div>
          <div><span>PUNTOS</span><b>{hud.score.toLocaleString('es-ES')}</b></div>
          <div><span>TIEMPO</span><b>{missionTime}</b></div>
        </div>

        <div className="pawn-slug-stage">
          <button
            type="button"
            className="pawn-slug-settings-trigger"
            aria-label="Abrir ajustes de Pawn Slug"
            onClick={openSettings}
          >
            ⚙ AJUSTES
          </button>

          <div
            ref={hostRef}
            className="pawn-slug-three"
            data-pawn-slug-renderer="three"
            aria-label="Escenario 2.5D de Pawn Slug renderizado con Three.js"
          />

          {!overlay && !settingsOpen && <PawnSlugTouchSurface send={send} />}

          <div className="pawn-slug-mission-progress" aria-label={`Progreso de misión ${missionPercent}%`}>
            <span>OPERACIÓN BAUERNSCHLAG</span>
            <div><i style={{ width: `${missionPercent}%` }} /></div>
            <b>{missionPercent}%</b>
          </div>

          {!overlay && (
            <div className="pawn-slug-arsenal" role="group" aria-label="Seleccionar arma">
              {weapons.map((weapon) => {
                const disabled = !weapon.unlocked || (weapon.id !== 'pistol' && weapon.ammo === 0);
                const count = weapon.id === 'pistol' ? '∞' : weapon.unlocked ? weapon.ammo : '—';
                const tier = pawnSlugWeaponUpgradeForLevel(weapon.id, hud.level).code;
                return (
                  <button
                    key={weapon.id}
                    type="button"
                    className={weapon.current ? 'is-current' : ''}
                    aria-pressed={Boolean(weapon.current)}
                    aria-label={`${weapon.slot}. ${weapon.label}${disabled ? ' · no disponible' : ''}`}
                    title={`${weapon.slot} · ${weapon.label} · ${tier}`}
                    disabled={disabled}
                    onClick={() => send(`weapon:${weapon.id}`, true)}
                  >
                    <kbd>{weapon.slot}</kbd>
                    <span>{weapon.shortLabel}</span>
                    <small>{tier} · {count}</small>
                  </button>
                );
              })}
            </div>
          )}

          {threatPercent != null && hud.phase === 'playing' && (
            <div className={`pawn-slug-boss${bossPercent == null ? ' is-midboss' : ''}`} role="status" aria-label={`${threatLabel} ${Math.round(threatPercent)}%`}>
              <span>{threatLabel}</span>
              <div><i style={{ width: `${threatPercent}%` }} /></div>
            </div>
          )}

          {hud.combo > 1 && hud.phase === 'playing' && <div className="pawn-slug-combo">MASSACRE x{hud.combo}</div>}
          {hud.toast && !overlay && <div className="pawn-slug-toast"><b>MATTHIAS</b><span>{hud.toast}</span></div>}
          {rendererError && <div className="pawn-slug-error" role="alert">{rendererError}</div>}

          {overlay && (
            <div className={`pawn-slug-overlay is-${hud.phase}`}>
              <span className="section-label">{hud.phase === 'ready' ? 'MISSION 1 · START' : hud.phase === 'victory' ? 'MISSION COMPLETE' : 'MISSION FAILED'}</span>
              <strong>{hud.phase === 'ready' ? 'BAUERNSCHLAG' : hud.phase === 'victory' ? 'SECTOR LIMPIO' : 'MATTHIAS HA SUFRIDO UNA PEQUEÑA INCIDENCIA'}</strong>
              <p>{hud.toast}</p>
              {hud.phase === 'ready' && (
                <div className="pawn-slug-briefing">
                  <span><b>Objetivo</b> Rompe el frente, sobrevive a los Sturm‑Bischof y elimina el Panzer‑Rook.</span>
                  <span><b>Progresión</b> Las bajas dan XP. Cada nivel aumenta tu HP máximo y potencia el daño. Cero ELO: esta locura vive sólo en Pawn Slug.</span>
                  <span><b>Arsenal</b> Empiezas con pistola. Requisa MG, escopeta y Panzerfaust; cada arma desbloquea mejoras Mk propias al ascender.</span>
                </div>
              )}
              {hud.phase !== 'ready' && <small>Nivel {hud.level} · {hud.score.toLocaleString('es-ES')} puntos · {missionTime}</small>}
              {hud.phase !== 'ready' && (
                <PawnSlugModelArmory
                  groups={hud.weaponModels || []}
                  credits={hud.credits || 0}
                  onSelect={(weaponId, modelId) => engineRef.current?.buyOrEquipWeaponModel?.(weaponId, modelId)}
                />
              )}
              <button
                type="button"
                className="primary-btn"
                disabled={hud.phase === 'ready' && bootRequested}
                onClick={hud.phase === 'ready' ? startOperation : () => send('action', true)}
              >
                {hud.phase === 'ready' ? (bootRequested ? 'PREPARANDO OPERACIÓN…' : 'INICIAR OPERACIÓN') : 'OTRA VEZ, CABRONES'}
              </button>
              <em>←/→ mover · ↓ agacharse · SHIFT saltar · ESPACIO disparar · CTRL power-up · 1–4/Q/E armas · ESC settings</em>
            </div>
          )}

          {!overlay && (
            <div className="pawn-slug-touch" aria-label="Controles táctiles de Pawn Slug">
              <div className="pawn-slug-touch-move">
                <TouchButton action="left" label="Izquierda" glyph="←" send={send} />
                <TouchButton action="right" label="Derecha" glyph="→" send={send} />
                <TouchButton action="crouch" label="Agacharse" glyph="↓" send={send} />
              </div>
              <div className="pawn-slug-touch-action">
                <TouchButton action="jump" label="Saltar" glyph="↑" send={send} />
                <TouchButton action="fire" label="Disparar" glyph="✹" send={send} className="is-fire" />
                <TouchButton action="grenade" label="Power-up" glyph="●" send={send} className="is-grenade" />
              </div>
            </div>
          )}

          {settingsOpen && (
            <div className="pawn-slug-settings-backdrop" role="presentation">
              <div
                className="pawn-slug-settings-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pawn-slug-settings-title"
              >
                <div className="pawn-slug-settings-head">
                  <div>
                    <span className="section-label">PAUSA · CONFIGURACIÓN</span>
                    <h3 id="pawn-slug-settings-title">Pawn Slug Settings</h3>
                  </div>
                  <button type="button" className="secondary-btn" onClick={closeSettings}>Continuar</button>
                </div>

                <div className="pawn-slug-settings-audio">
                  <label>
                    <span>Música <b>{percent(settings.musicVolume)}%</b></span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.musicVolume}
                      onChange={(event) => commitSettings(
                        { ...settings, musicVolume: Number(event.target.value) },
                        { audio: true },
                      )}
                    />
                  </label>
                  <label>
                    <span>SFX <b>{percent(settings.sfxVolume)}%</b></span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.sfxVolume}
                      onChange={(event) => commitSettings(
                        { ...settings, sfxVolume: Number(event.target.value) },
                        { audio: true },
                      )}
                    />
                  </label>
                </div>

                <div className="pawn-slug-settings-remap">
                  <div className="pawn-slug-settings-section-title">
                    <span>Teclado</span>
                    <button
                      type="button"
                      onClick={() => commitSettings({ ...settings, keymap: PAWN_SLUG_DEFAULT_KEYMAP })}
                    >
                      Restaurar defaults
                    </button>
                  </div>
                  <div className="pawn-slug-keymap-grid">
                    {PAWN_SLUG_CONTROL_ACTIONS.map((action) => (
                      <div key={action} className={remapAction === action ? 'is-listening' : ''}>
                        <span>{PAWN_SLUG_CONTROL_LABELS[action]}</span>
                        <button
                          type="button"
                          aria-label={`Cambiar tecla de ${PAWN_SLUG_CONTROL_LABELS[action]}`}
                          onClick={() => {
                            setRemapError('');
                            setRemapAction(action);
                          }}
                        >
                          <kbd>{remapAction === action ? 'PULSA…' : pawnSlugKeyLabel(keymap[action])}</kbd>
                        </button>
                      </div>
                    ))}
                  </div>
                  {remapError && <p className="pawn-slug-remap-error" role="alert">{remapError}</p>}
                  <small>Las teclas 1–4 y Q/E siguen reservadas para seleccionar/cambiar arma. ESC siempre puede abrir este menú como salida de emergencia.</small>
                </div>

                <div className="pawn-slug-settings-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      engineRef.current?.restart?.();
                      closeSettings();
                    }}
                  >
                    Reiniciar misión
                  </button>
                  <button type="button" className="primary-btn" onClick={closeSettings}>Continuar</button>
                  <button type="button" className="pawn-slug-exit-btn" onClick={onExit}>Salir del juego</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="pawn-slug-controls">
          <div><kbd>{pawnSlugKeyLabel(keymap.moveLeft)}</kbd><kbd>{pawnSlugKeyLabel(keymap.moveRight)}</kbd><span>Mover</span></div>
          <div><kbd>{pawnSlugKeyLabel(keymap.crouch)}</kbd><span>Agacharse</span></div>
          <div><kbd>{pawnSlugKeyLabel(keymap.jump)}</kbd><span>Saltar</span></div>
          <div><kbd>{pawnSlugKeyLabel(keymap.fire)}</kbd><span>Disparar</span></div>
          <div><kbd>{pawnSlugKeyLabel(keymap.usePowerup)}</kbd><span>Power-up</span></div>
          <div><kbd>1–4</kbd><kbd>Q/E</kbd><span>Arma</span></div>
          <small>{rendererName} · ESC abre Settings.</small>
        </footer>
      </section>
    </div>
  );
}
