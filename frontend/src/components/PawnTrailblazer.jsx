import { useEffect, useRef, useState } from 'react';
import { trailSpriteStyle } from '../pawnTrailblazerSprites.js';
import {
  TRAIL_PROMOTION_BONUS,
  trailPowerLabel,
  trailSectorForDistance,
} from '../pawnTrailblazer.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './PawnTrailblazer.css';

const INITIAL_HUD = Object.freeze({
  phase: 'ready',
  lane: 2,
  lives: 3,
  score: 0,
  distance: 0,
  speed: 5.2,
  power: null,
  powerLeft: 0,
  combo: 0,
  captures: 0,
  duel: null,
  sector: trailSectorForDistance(0),
  promotionActive: false,
  toast: 'Nací peón. Siempre seré peón.',
});

export default function PawnTrailblazer({ onExit }) {
  useEscapeToClose(onExit);
  const threeHostRef = useRef(null);
  const engineRef = useRef(null);
  const pendingControlsRef = useRef([]);
  const musicRef = useRef('synthmetal');
  const [hud, setHud] = useState(INITIAL_HUD);
  const [music, setMusic] = useState('synthmetal');
  const [rendererName, setRendererName] = useState('CARGANDO');
  const [rendererError, setRendererError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let engine = null;
    const host = threeHostRef.current;
    if (!host) return undefined;

    void import('../pawnTrailblazerThree.js')
      .then(({ createPawnTrailblazerGame }) => {
        if (cancelled) return;
        engine = createPawnTrailblazerGame(host, {
          onReady: (backend) => {
            if (!cancelled) setRendererName(backend);
          },
          onHud: (nextHud) => {
            if (!cancelled) setHud(nextHud);
          },
        });
        engineRef.current = engine;
        engine.setMusic(musicRef.current);
        for (const control of pendingControlsRef.current.splice(0)) engine.input(control);
      })
      .catch((error) => {
        console.error('Pawn Trailblazer Three.js boot failed', error);
        if (!cancelled) {
          setRendererName('THREE.JS · ERROR');
          setRendererError('No se ha podido iniciar el motor 3D.');
        }
      });

    return () => {
      cancelled = true;
      engine?.destroy();
      if (engineRef.current === engine) engineRef.current = null;
      pendingControlsRef.current = [];
    };
  }, []);

  function sendControl(control) {
    const engine = engineRef.current;
    if (engine) engine.input(control);
    else pendingControlsRef.current.push(control);
  }

  function switchMusic(next) {
    setMusic(next);
    musicRef.current = next;
    engineRef.current?.setMusic(next);
  }

  const hudSector = hud.sector || trailSectorForDistance(hud.distance || 0);
  const powerSeconds = hud.power ? Math.max(1, Math.ceil((hud.powerLeft || 0) / 1000)) : 0;
  const duelMeter = Math.max(0, Math.min(100, hud.duel?.meter || 0));

  return (
    <div className="pawn-trailblazer" data-pawn-trailblazer="true">
      <div className="pawn-trailblazer-head">
        <div>
          <span className="section-label">EXPERIMENTO ARCADE · THREE.JS</span>
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
            ref={threeHostRef}
            className="pawn-trailblazer-three"
            data-pawn-trailblazer-renderer="three"
            aria-label="Corredor 3D de Pawn Trailblazer controlado por Three.js"
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
              <span
                className="pawn-trailblazer-overlay-sprite"
                role="img"
                aria-label="Matthias corredor"
                style={trailSpriteStyle('matthiasRun')}
              />
              <span>{hud.phase === 'gameover' ? 'FIN DE MANIOBRAS' : 'GENERAL MATTHIAS VON LOPSTEIN'}</span>
              <strong>{hud.phase === 'gameover' ? `${hud.distance || 0} m · ${hud.score || 0} puntos · ${hud.captures || 0} capturas` : 'Nací peón. Siempre seré peón.'}</strong>
              <button type="button" className="primary-btn" onClick={() => sendControl('action')}>{hud.phase === 'gameover' ? 'Otra vez' : 'Iniciar carrera'}</button>
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
              <button type="button" aria-label="Mover o capturar a la izquierda" onClick={() => sendControl('left')}>
                <span aria-hidden="true">←</span>
                <small>IZQ</small>
              </button>
              <button type="button" className="pawn-trailblazer-touch-action" aria-label={hud.phase === 'duel' ? 'Empujar al peón rival' : 'Acción'} onClick={() => sendControl('action')}>
                <span aria-hidden="true">⚔</span>
                <small>{hud.phase === 'duel' ? 'EMPUJA' : 'ACCIÓN'}</small>
              </button>
              <button type="button" aria-label="Mover o capturar a la derecha" onClick={() => sendControl('right')}>
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

        <p className="pawn-trailblazer-note">Motor {rendererName}. Three.js controla escena, cámara, sprites, colisiones de carril y render; React queda como shell accesible del experimento. El modo sigue aislado del rating competitivo.</p>
      </div>
    </div>
  );
}
