import { useEffect, useMemo, useRef, useState } from 'react';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { request } from '../http.js';
import { createChesscomAudio } from '../chesscomAudio.js';
import {
  CHESSCOM_COVER,
  chesscomCreateState,
  chesscomDistance,
  chesscomEndTurn,
  chesscomInteract,
  chesscomKey,
  chesscomMissionStatus,
  chesscomMove,
  chesscomReachable,
  chesscomSetOverwatch,
  chesscomShoot,
} from '../chesscom.js';
import './Chesscom.css';

const MATTHIAS_CANONICAL_ASSET_URL = '/matthias-home-canonical.b64?v=88bebc7e44293093';
const ACTIONS = [
  ['move', '↗', 'Move'],
  ['shoot', '⌖', 'Shoot'],
  ['overwatch', '◉', 'Overwatch'],
  ['interact', '▣', 'Interact'],
];

function canonicalMatthiasDataUrl(payload) {
  const normalized = String(payload || '').trim();
  if (!normalized.startsWith('UklG')) throw new Error('Canonical Matthias WebP payload is invalid');
  return `data:image/webp;base64,${normalized}`;
}

function clampPercent(value, max) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function Objective({ done, children }) {
  return <li className={done ? 'is-done' : ''}><i aria-hidden="true">{done ? '✓' : ''}</i><span>{children}</span></li>;
}

function SquadPortrait({ unit, selected, matthiasArt, onSelect }) {
  return (
    <button type="button" className={`chesscom-squad-card ${selected ? 'is-selected' : ''} ${unit.hp <= 0 ? 'is-down' : ''}`} onClick={onSelect}>
      <span className="chesscom-portrait" aria-hidden="true">
        {unit.id === 'matthias' && matthiasArt
          ? <img src={matthiasArt} alt="" />
          : <span className={`chesscom-portrait-art is-${unit.id}`} />}
        <span className="chesscom-portrait-noise" />
      </span>
      <span className="chesscom-squad-copy">
        <strong>{unit.name}</strong>
        <small>{unit.role}</small>
        <span className="chesscom-mini-row"><em>HP</em><i><b style={{ width:`${clampPercent(unit.hp, unit.maxHp)}%` }} /></i><strong>{unit.hp}/{unit.maxHp}</strong></span>
        <span className="chesscom-mini-row"><em>AP</em><i><b style={{ width:`${clampPercent(unit.ap, unit.maxAp)}%` }} /></i><strong>{unit.ap}/{unit.maxAp}</strong></span>
      </span>
    </button>
  );
}

function WeaponPanel({ unit }) {
  return (
    <div className="chesscom-panel chesscom-weapon">
      <div className="chesscom-weapon-title">
        <div><strong>{unit?.weapon || '—'}</strong><small>{unit?.id === 'matthias' ? 'Used · fixer stock · serial scrubbed' : 'Contract issue'}</small></div>
        <span className="chesscom-weapon-art" aria-hidden="true" />
      </div>
      <dl>
        <div><dt>DMG</dt><dd>{unit?.damage || 0}</dd></div>
        <div><dt>RNG</dt><dd>{unit?.range || 0}</dd></div>
        <div><dt>AP</dt><dd>2</dd></div>
        <div><dt>RELIABILITY</dt><dd className={(unit?.reliability || 100) < 93 ? 'is-warning' : ''}>{unit?.reliability || 100}%</dd></div>
        <div><dt>AMMO</dt><dd>{unit?.ammo ?? '—'}/30</dd></div>
      </dl>
    </div>
  );
}

export default function Chesscom({ onExit }) {
  useEscapeToClose(onExit);
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const audioRef = useRef(null);
  const tileClickRef = useRef(null);
  const unitClickRef = useRef(null);
  const previousStatusRef = useRef('active');
  const [state, setState] = useState(() => chesscomCreateState());
  const [matthiasArt, setMatthiasArt] = useState('');
  const [hovered, setHovered] = useState(null);
  const [rendererName, setRendererName] = useState('CARGANDO BABYLON');
  const [rendererError, setRendererError] = useState('');

  useEffect(() => {
    const scroller = document.scrollingElement;
    if (scroller) scroller.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    const audio = createChesscomAudio();
    audioRef.current = audio;
    return () => {
      audio.destroy();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, []);

  const selected = state.friendlies.find((unit) => unit.id === state.selectedId) || state.friendlies[0];
  const reachable = useMemo(() => chesscomReachable(state, selected), [state, selected]);
  const reachableMap = useMemo(() => new Map(reachable.map((tile) => [chesscomKey(tile.x,tile.y),tile])), [reachable]);
  const reachableSet = useMemo(() => new Set(reachableMap.keys()), [reachableMap]);
  const movementTiles = useMemo(() => state.action === 'move' ? reachable : [], [state.action, reachable]);
  const movementReachableSet = useMemo(() => state.action === 'move' ? reachableSet : new Set(), [state.action, reachableSet]);
  const hoveredMove = hovered?.type === 'tile' && state.action === 'move'
    ? reachableMap.get(chesscomKey(hovered.x, hovered.y))
    : null;
  const targetableSet = useMemo(() => {
    if (state.action !== 'shoot' || !selected || selected.ap < 2) return new Set();
    return new Set(state.enemies.filter((enemy) => enemy.hp > 0 && chesscomDistance(selected,enemy) <= selected.range).map((enemy) => chesscomKey(enemy.x,enemy.y)));
  }, [state.action,state.enemies,selected]);
  const status = chesscomMissionStatus(state);

  function wakeAudio(kind = null) {
    audioRef.current?.arm();
    if (kind) audioRef.current?.play(kind);
  }

  function selectFriendly(id) {
    wakeAudio();
    setState((current) => ({ ...current, selectedId:id }));
  }

  function clickTile(x,y) {
    if (!selected || status !== 'active') return;
    const key = chesscomKey(x,y);
    const enemy = state.enemies.find((unit) => unit.hp > 0 && unit.x === x && unit.y === y);
    if (state.action === 'shoot' && enemy) {
      wakeAudio('shoot');
      setState((current) => chesscomShoot(current, selected.id, enemy.id));
      return;
    }
    if (state.action === 'interact') {
      wakeAudio('intel');
      setState((current) => chesscomInteract(current, selected.id));
      return;
    }
    if (state.action === 'move' && reachableMap.has(key)) {
      wakeAudio('move');
      setState((current) => chesscomMove(current, selected.id, x, y));
    }
  }

  function clickUnit(id,friendly) {
    if (friendly) { selectFriendly(id); return; }
    if (state.action === 'shoot') {
      wakeAudio('shoot');
      setState((current) => chesscomShoot(current, selected.id, id));
    }
  }

  tileClickRef.current = clickTile;
  unitClickRef.current = clickUnit;

  useEffect(() => {
    let alive = true;
    request(MATTHIAS_CANONICAL_ASSET_URL, { cache:'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((payload) => { if (alive) setMatthiasArt(canonicalMatthiasDataUrl(payload)); })
      .catch(() => { if (alive) setMatthiasArt(''); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let engine;
    const host = hostRef.current;
    if (!host) return undefined;
    void import('../chesscomBabylon.js')
      .then(({ createChesscomBabylon }) => createChesscomBabylon(host, {
        onTile:(x,y) => tileClickRef.current?.(x,y),
        onUnit:(id,friendly) => unitClickRef.current?.(id,friendly),
        onHover:(meta) => { if (!cancelled) setHovered(meta); },
        onReady:(name) => { if (!cancelled) setRendererName(name); },
      }))
      .then((created) => {
        if (cancelled) { created.destroy(); return; }
        engine = created;
        engineRef.current = created;
      })
      .catch((error) => {
        console.error('Chesscom Babylon boot failed', error);
        if (!cancelled) {
          setRendererName('BABYLON · ERROR');
          setRendererError('El motor 3D no ha arrancado. La operación ha sido negada incluso antes de empezar.');
        }
      });
    return () => {
      cancelled = true;
      engine?.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.update(state, {
      reachable:movementReachableSet,
      reachableTiles:movementTiles,
      targetable:targetableSet,
      selectedId:selected?.id,
      matthiasArt,
    });
    const livingEnemies = state.enemies.filter((unit) => unit.hp > 0).length;
    audioRef.current?.setThreat(Math.min(1, .18 + livingEnemies * .16 + Math.max(0,state.turn-1) * .035));
  }, [state,movementReachableSet,movementTiles,targetableSet,selected?.id,matthiasArt,rendererName]);

  useEffect(() => {
    if (status === 'complete' && previousStatusRef.current !== 'complete') audioRef.current?.play('complete');
    previousStatusRef.current = status;
  }, [status]);

  function chooseAction(action) {
    if (action === 'overwatch') {
      wakeAudio('overwatch');
      setState((current) => chesscomSetOverwatch(current, selected.id));
      return;
    }
    wakeAudio();
    setState((current) => ({ ...current, action }));
  }

  function reload() {
    if (!selected || selected.ap < 1) return;
    wakeAudio('reload');
    setState((current) => ({
      ...current,
      friendlies:current.friendlies.map((unit) => unit.id === selected.id ? { ...unit, ammo:30, ap:Math.max(0,unit.ap-1) } : unit),
      log:[`${selected.name} recarga.`,...current.log].slice(0,5),
    }));
  }

  function endTurn() {
    wakeAudio('turn');
    setState((current) => chesscomEndTurn(current));
  }

  return (
    <div className="chesscom" data-chesscom-poc="true" data-chesscom-renderer="babylon" data-chesscom-visual="premium-v1">
      <header className="chesscom-topbar">
        <div className="chesscom-brand">
          <span className="chesscom-rook" aria-hidden="true">♜</span>
          <div><h2>CHESSCOM</h2><strong>BLACK OPERATIONS</strong><small>TACTICAL POC · NO FLAGS · NO RECORDS</small></div>
        </div>
        <div className="chesscom-top-actions"><span className="chesscom-classified">CLASSIFIED // DUST VEIL</span><button type="button" className="chesscom-exit" onClick={onExit}>← Experimentos</button></div>
      </header>

      <section className="chesscom-frame">
        <aside className="chesscom-left">
          <div className="chesscom-panel chesscom-objectives">
            <h3>OBJECTIVES</h3>
            <ul>
              <Objective done={state.objectives.target}>Neutralize the target</Objective>
              <Objective done={state.objectives.intel}>Retrieve the intel case</Objective>
              <Objective done={state.objectives.extraction}>Reach extraction</Objective>
            </ul>
          </div>
          <div className="chesscom-squad" aria-label="Escuadra desplegada">
            {state.friendlies.map((unit) => <SquadPortrait key={unit.id} unit={unit} selected={unit.id === selected?.id} matthiasArt={matthiasArt} onSelect={() => selectFriendly(unit.id)} />)}
          </div>
          <div className="chesscom-panel chesscom-contact-card"><span>LOCAL NETWORK</span><strong>POOR</strong><small>Stock irregular · extracción no garantizada</small></div>
        </aside>

        <main className="chesscom-stage-wrap">
          <div className="chesscom-stage-shell">
            <div ref={hostRef} className="chesscom-babylon-host" />
            <div className="chesscom-stage-scanlines" aria-hidden="true" />
            <div className="chesscom-operation chesscom-panel">
              <h3>OPERATION: DUST VEIL</h3>
              <dl><div><dt>Location</dt><dd>Kharif Outpost</dd></div><div><dt>Local contacts</dt><dd className="is-danger">Poor</dd></div><div><dt>Expected equipment</dt><dd className="is-warning">Limited</dd></div></dl>
            </div>
            <div className="chesscom-mission-badge"><span>TURN {state.turn}</span><strong>{state.action.toUpperCase()}</strong></div>
            {hovered?.type === 'tile' && (
              <div className="chesscom-hover-card">
                <b>Terrain {hovered.x+1},{hovered.y+1}</b>
                <span>Cover: {CHESSCOM_COVER.get(chesscomKey(hovered.x,hovered.y)) || 'Open'}</span>
                {hoveredMove && <span>Move: {hoveredMove.cost} AP</span>}
              </div>
            )}
            {rendererError && <div className="chesscom-render-error" role="alert">{rendererError}</div>}
            {status !== 'active' && (
              <div className="chesscom-result-overlay">
                <span className="section-label">{status === 'complete' ? 'MISSION COMPLETE' : 'MISSION FAILED'}</span>
                <strong>{status === 'complete' ? 'DUST VEIL · EXFIL SUCCESS' : 'ASSET DENIED'}</strong>
                <p>{status === 'complete' ? 'Objetivo neutralizado, dossier recuperado y al menos un operador ha llegado a extracción.' : 'No quedan operadores capaces de continuar la misión.'}</p>
                <button type="button" className="primary-btn" onClick={() => setState(chesscomCreateState())}>Repetir operación</button>
              </div>
            )}
          </div>

          <div className="chesscom-actionbar" role="toolbar" aria-label="Acciones tácticas">
            {ACTIONS.map(([action,glyph,label]) => <button key={action} type="button" className={state.action===action?'is-active':''} onClick={() => chooseAction(action)} disabled={status!=='active'||selected?.hp<=0}><span aria-hidden="true">{glyph}</span><small>{label}</small></button>)}
            <button type="button" onClick={reload} disabled={status!=='active'||selected?.ap<1}><span aria-hidden="true">▥</span><small>Reload</small></button>
            <button type="button" className="is-end-turn" onClick={endTurn} disabled={status!=='active'}><span aria-hidden="true">↻</span><small>End turn</small></button>
          </div>
        </main>

        <aside className="chesscom-right">
          <WeaponPanel unit={selected} />
          <div className="chesscom-panel chesscom-economy"><span>DEPLOYMENT</span><strong>{state.deploymentCost.toLocaleString('es-ES')} cr</strong><small>Funds: {state.credits.toLocaleString('es-ES')} cr</small></div>
          <div className="chesscom-panel chesscom-log"><h3>FIELD LOG</h3>{state.log.map((line,index)=><p key={`${line}-${index}`}>{line}</p>)}</div>
          <blockquote>“Good people, bad jobs.”<small>— Matthias</small></blockquote>
        </aside>
      </section>

      <footer className="chesscom-footer"><span>{rendererName} · PREMIUM V1</span><b>CONTRACTS · MERCENARIES · EQUIPMENT · NO OFFICIAL RECORDS</b><small>OPS AUDIO · dynamic threat score</small></footer>
    </div>
  );
}
