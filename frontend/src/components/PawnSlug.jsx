import { useEffect, useRef, useState } from 'react';
import { pawnSlugWeaponUpgradeForLevel } from '../pawnSlug.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './PawnSlug.css';
import './PawnSlugArsenal.css';

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
  grenades: 4,
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

export default function PawnSlug({ onExit }) {
  useEscapeToClose(onExit);
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const pendingRef = useRef([]);
  const [hud, setHud] = useState(INITIAL_HUD);
  const [rendererName, setRendererName] = useState('CARGANDO');
  const [rendererError, setRendererError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let engine = null;
    const host = hostRef.current;
    if (!host) return undefined;

    void import('../pawnSlugThree.js')
      .then(({ createPawnSlugGame }) => {
        if (cancelled) return;
        engine = createPawnSlugGame(host, {
          onReady: (name) => {
            if (!cancelled) setRendererName(name);
          },
          onHud: (nextHud) => {
            if (!cancelled) setHud(nextHud);
          },
        });
        engineRef.current = engine;
        for (const [action, pressed] of pendingRef.current.splice(0)) engine.input(action, pressed);
      })
      .catch((error) => {
        console.error('Pawn Slug Three.js boot failed', error);
        if (!cancelled) {
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
  }, []);

  function send(action, pressed = true) {
    const engine = engineRef.current;
    if (engine) engine.input(action, pressed);
    else pendingRef.current.push([action, pressed]);
  }

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
          <div><span>GRANADAS</span><b>{hud.grenades}</b></div>
          <div><span>PUNTOS</span><b>{hud.score.toLocaleString('es-ES')}</b></div>
          <div><span>TIEMPO</span><b>{missionTime}</b></div>
        </div>

        <div className="pawn-slug-stage">
          <div
            ref={hostRef}
            className="pawn-slug-three"
            data-pawn-slug-renderer="three"
            aria-label="Escenario 2.5D de Pawn Slug renderizado con Three.js"
          />

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
              <button type="button" className="primary-btn" onClick={() => send('action', true)}>{hud.phase === 'ready' ? 'INICIAR OPERACIÓN' : 'OTRA VEZ, CABRONES'}</button>
              <em>Z/J dispara · 1–4 arma · Q/E cambia · X/K granada · WASD/flechas mueven</em>
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
                <TouchButton action="grenade" label="Granada" glyph="●" send={send} className="is-grenade" />
              </div>
            </div>
          )}
        </div>

        <footer className="pawn-slug-controls">
          <div><kbd>A</kbd><kbd>D</kbd><span>Mover</span></div>
          <div><kbd>W</kbd><kbd>ESPACIO</kbd><span>Saltar</span></div>
          <div><kbd>S</kbd><span>Agacharse</span></div>
          <div><kbd>Z</kbd><kbd>J</kbd><span>Disparar</span></div>
          <div><kbd>1–4</kbd><kbd>Q/E</kbd><span>Arma</span></div>
          <div><kbd>X</kbd><kbd>K</kbd><span>Granada</span></div>
          <small>{rendererName} · Three.js se carga sólo al entrar en Pawn Slug.</small>
        </footer>
      </section>
    </div>
  );
}