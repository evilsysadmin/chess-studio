import { useEffect, useMemo, useState } from 'react';
import { useEscapeToClose } from '../useEscapeToClose.js';
import {
  CHESSCOM_COVER,
  CHESSCOM_EXTRACTION,
  CHESSCOM_HEIGHT,
  CHESSCOM_INTEL,
  CHESSCOM_WIDTH,
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
import {
  MATTHIAS_CANONICAL_ASSET_URL,
  canonicalMatthiasDataUrl,
} from './MatthiasCanonicalMock.js';
import './Chesscom.css';

const TILE_W = 72;
const TILE_H = 36;
const ORIGIN_X = 520;
const ORIGIN_Y = 92;

const ACTIONS = [
  ['move', '↗', 'Move'],
  ['shoot', '⌖', 'Shoot'],
  ['overwatch', '◉', 'Overwatch'],
  ['interact', '▣', 'Interact'],
];

const SCENERY = [
  { x:1,y:1,type:'wall',w:3,label:'OFFICE' },
  { x:5,y:0,type:'warehouse',w:3,label:'STORAGE' },
  { x:1,y:4,type:'shed',w:2,label:'NO FLAGS' },
  { x:7,y:5,type:'wall',w:2,label:'JUST JOBS' },
  { x:2,y:2,type:'crate' }, { x:3,y:2,type:'crate low' }, { x:5,y:2,type:'crate' },
  { x:6,y:2,type:'crate low' }, { x:7,y:2,type:'crate' }, { x:2,y:3,type:'barrel' },
  { x:6,y:3,type:'crate' }, { x:8,y:3,type:'crate low' }, { x:1,y:4,type:'crate' },
  { x:5,y:4,type:'crate low' }, { x:7,y:4,type:'crate' }, { x:2,y:5,type:'crate' },
  { x:4,y:5,type:'crate low' }, { x:7,y:5,type:'sandbag' }, { x:8,y:5,type:'crate' },
  { x:1,y:6,type:'barrel' }, { x:5,y:6,type:'crate' }, { x:7,y:6,type:'sandbag' },
  { x:8,y:6,type:'crate' }, { x:9,y:2,type:'truck' }, { x:8,y:0,type:'tower' },
];

function iso(x, y, lift = 0) {
  return {
    left: ORIGIN_X + (x - y) * (TILE_W / 2),
    top: ORIGIN_Y + (x + y) * (TILE_H / 2) - lift,
  };
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
          : <span className={`chesscom-face is-${unit.id}`}><i /><b /></span>}
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

function UnitSprite({ unit, friendly, selected, matthiasArt, onClick }) {
  const pos = iso(unit.x, unit.y, friendly ? 25 : 22);
  return (
    <button
      type="button"
      className={`chesscom-unit ${friendly ? 'is-friendly' : 'is-enemy'} ${selected ? 'is-selected' : ''} ${unit.elite ? 'is-elite' : ''} ${unit.hp <= 0 ? 'is-down' : ''}`}
      style={{ left:pos.left, top:pos.top }}
      onClick={(event) => { event.stopPropagation(); onClick?.(); }}
      aria-label={`${unit.name}, ${unit.hp} HP`}
      disabled={unit.hp <= 0}
    >
      <span className="chesscom-unit-name">{unit.name}</span>
      <span className="chesscom-unit-health"><i style={{ width:`${clampPercent(unit.hp, unit.maxHp)}%` }} /></span>
      {unit.id === 'matthias' && matthiasArt
        ? <img className="chesscom-matthias-sprite" src={matthiasArt} alt="" />
        : <span className={`chesscom-soldier is-${friendly ? unit.id : 'hostile'}`} aria-hidden="true"><i className="head"/><i className="torso"/><i className="weapon"/><i className="legs"/></span>}
      {unit.overwatch && <span className="chesscom-overwatch-mark">◉</span>}
      {!friendly && <span className="chesscom-enemy-chevron">▼</span>}
    </button>
  );
}

function EnvironmentProp({ item }) {
  const lift = item.type === 'tower' ? 74 : item.type === 'warehouse' || item.type === 'wall' ? 48 : item.type === 'truck' ? 24 : 12;
  const pos = iso(item.x, item.y, lift);
  return <div className={`chesscom-prop is-${item.type.replace(' ','-')}`} style={{ left:pos.left, top:pos.top, '--prop-w':item.w || 1 }} aria-hidden="true"><span>{item.label || ''}</span></div>;
}

export default function Chesscom({ onExit }) {
  useEscapeToClose(onExit);
  const [state, setState] = useState(() => chesscomCreateState());
  const [matthiasArt, setMatthiasArt] = useState('');
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(MATTHIAS_CANONICAL_ASSET_URL, { cache:'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((payload) => { if (alive) setMatthiasArt(canonicalMatthiasDataUrl(payload)); })
      .catch(() => { if (alive) setMatthiasArt(''); });
    return () => { alive = false; };
  }, []);

  const selected = state.friendlies.find((unit) => unit.id === state.selectedId) || state.friendlies[0];
  const reachable = useMemo(() => new Map(chesscomReachable(state, selected).map((tile) => [chesscomKey(tile.x,tile.y), tile])), [state, selected]);
  const status = chesscomMissionStatus(state);

  function selectFriendly(id) {
    setState((current) => ({ ...current, selectedId:id }));
  }

  function clickTile(x, y) {
    if (!selected || status !== 'active') return;
    const key = chesscomKey(x,y);
    const enemy = state.enemies.find((unit) => unit.hp > 0 && unit.x === x && unit.y === y);
    if (state.action === 'shoot' && enemy) {
      setState((current) => chesscomShoot(current, selected.id, enemy.id));
      return;
    }
    if (state.action === 'interact') {
      setState((current) => chesscomInteract(current, selected.id));
      return;
    }
    if (state.action === 'move' && reachable.has(key)) {
      setState((current) => chesscomMove(current, selected.id, x, y));
    }
  }

  function chooseAction(action) {
    if (action === 'overwatch') {
      setState((current) => chesscomSetOverwatch(current, selected.id));
      return;
    }
    setState((current) => ({ ...current, action }));
  }

  function enemyClick(enemy) {
    if (state.action === 'shoot') setState((current) => chesscomShoot(current, selected.id, enemy.id));
  }

  function resetMission() {
    setState(chesscomCreateState());
  }

  const tiles = [];
  for (let y=0; y<CHESSCOM_HEIGHT; y += 1) {
    for (let x=0; x<CHESSCOM_WIDTH; x += 1) {
      const key = chesscomKey(x,y);
      const pos = iso(x,y);
      const cover = CHESSCOM_COVER.get(key);
      const isReachable = state.action === 'move' && reachable.has(key);
      const isIntel = x === CHESSCOM_INTEL.x && y === CHESSCOM_INTEL.y;
      const isExtraction = x === CHESSCOM_EXTRACTION.x && y === CHESSCOM_EXTRACTION.y;
      const enemy = state.enemies.find((unit) => unit.hp > 0 && unit.x === x && unit.y === y);
      const inRange = state.action === 'shoot' && enemy && selected && chesscomDistance(selected,enemy) <= selected.range && selected.ap >= 2;
      tiles.push(
        <button
          type="button"
          key={key}
          className={`chesscom-tile ${isReachable ? 'is-reachable' : ''} ${inRange ? 'is-targetable' : ''} ${isIntel ? 'is-intel' : ''} ${isExtraction ? 'is-extraction' : ''}`}
          style={{ left:pos.left, top:pos.top }}
          onClick={() => clickTile(x,y)}
          onMouseEnter={() => setHovered({x,y,cover:cover || 'none',cost:reachable.get(key)?.cost || null})}
          onMouseLeave={() => setHovered(null)}
          aria-label={`Casilla ${x+1},${y+1}${cover ? `, cobertura ${cover}` : ''}`}
        />,
      );
    }
  }

  return (
    <div className="chesscom" data-chesscom-poc="true">
      <header className="chesscom-topbar">
        <div className="chesscom-brand">
          <span className="chesscom-rook" aria-hidden="true">♜</span>
          <div><h2>CHESSCOM</h2><strong>BLACK OPERATIONS</strong><small>POC v0.1 · SOME WARS ARE NOT ON THE BOARD</small></div>
        </div>
        <button type="button" className="chesscom-exit" onClick={onExit}>← Experimentos</button>
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
        </aside>

        <main className="chesscom-stage-wrap">
          <div className="chesscom-stage" role="application" aria-label="Campo táctico isométrico de Chesscom">
            <div className="chesscom-ground" aria-hidden="true" />
            <div className="chesscom-sand is-a" aria-hidden="true" />
            <div className="chesscom-sand is-b" aria-hidden="true" />
            <div className="chesscom-fence is-a" aria-hidden="true" />
            <div className="chesscom-fence is-b" aria-hidden="true" />
            <div className="chesscom-lamp is-a" aria-hidden="true" />
            <div className="chesscom-lamp is-b" aria-hidden="true" />
            {tiles}
            {SCENERY.map((item,index) => <EnvironmentProp key={`${item.type}-${item.x}-${item.y}-${index}`} item={item} />)}

            <div className="chesscom-intel-case" style={iso(CHESSCOM_INTEL.x,CHESSCOM_INTEL.y,34)} aria-label="Dossier de inteligencia">▣</div>
            <div className="chesscom-extraction-marker" style={iso(CHESSCOM_EXTRACTION.x,CHESSCOM_EXTRACTION.y,3)} aria-hidden="true"><span>EXFIL</span></div>

            {state.friendlies.map((unit) => <UnitSprite key={unit.id} unit={unit} friendly selected={unit.id === selected?.id} matthiasArt={matthiasArt} onClick={() => selectFriendly(unit.id)} />)}
            {state.enemies.map((unit) => <UnitSprite key={unit.id} unit={unit} friendly={false} selected={false} matthiasArt="" onClick={() => enemyClick(unit)} />)}

            {hovered && <div className="chesscom-hover-card"><b>{hovered.cost ? `Move · AP ${hovered.cost}` : 'Terrain'}</b><span>Cover: {hovered.cover === 'high' ? 'High' : hovered.cover === 'low' ? 'Low' : 'Open'}</span></div>}

            <div className="chesscom-wall-slogan" aria-hidden="true">NO NATIONS<br/>NO FLAGS<br/>JUST JOBS</div>
          </div>

          <div className="chesscom-actionbar" role="toolbar" aria-label="Acciones tácticas">
            {ACTIONS.map(([action,glyph,label]) => (
              <button key={action} type="button" className={state.action === action ? 'is-active' : ''} onClick={() => chooseAction(action)} disabled={status !== 'active' || selected?.hp <= 0}>
                <span aria-hidden="true">{glyph}</span><small>{label}</small>
              </button>
            ))}
            <button type="button" onClick={() => setState((current) => ({ ...current, friendlies:current.friendlies.map((unit) => unit.id === selected.id ? { ...unit, ammo:30, ap:Math.max(0,unit.ap-1) } : unit), log:[`${selected.name} recarga.`,...current.log].slice(0,5) }))} disabled={status !== 'active' || selected?.ap < 1}><span aria-hidden="true">▥</span><small>Reload</small></button>
            <button type="button" className="is-end-turn" onClick={() => setState((current) => chesscomEndTurn(current))} disabled={status !== 'active'}><span aria-hidden="true">↻</span><small>End turn</small></button>
          </div>
        </main>

        <aside className="chesscom-right">
          <div className="chesscom-panel chesscom-operation">
            <h3>OPERATION: DUST VEIL</h3>
            <dl><div><dt>Location</dt><dd>Kharif Outpost</dd></div><div><dt>Local contacts</dt><dd className="is-danger">Poor</dd></div><div><dt>Equipment availability</dt><dd className="is-warning">Limited</dd></div><div><dt>Turn</dt><dd>{state.turn}</dd></div></dl>
          </div>

          <div className="chesscom-panel chesscom-economy">
            <span><small>OPERATING CASH</small><strong>{state.credits.toLocaleString('en-US')} cr</strong></span>
            <span><small>DEPLOYMENT</small><strong>-{state.deploymentCost.toLocaleString('en-US')} cr</strong></span>
          </div>

          <div className="chesscom-panel chesscom-weapon">
            <div className="chesscom-rifle" aria-hidden="true"><i/><b/><span/></div>
            <h3>{selected?.weapon || '—'}</h3>
            <small>{selected?.id === 'matthias' ? 'Used · fixer stock' : 'Contract issue'}</small>
            <dl>
              <div><dt>DMG</dt><dd>{selected?.damage || 0}</dd></div>
              <div><dt>RNG</dt><dd>{selected?.range || 0}</dd></div>
              <div><dt>AP</dt><dd>{selected?.ap || 0}/{selected?.maxAp || 0}</dd></div>
              <div><dt>RELIABILITY</dt><dd>{selected?.reliability || 96}%</dd></div>
              <div><dt>AMMO</dt><dd>{selected?.ammo || 0}/30</dd></div>
            </dl>
          </div>

          <div className="chesscom-panel chesscom-radio" aria-live="polite">
            <h3>FIELD LOG</h3>
            {state.log.slice(0,3).map((line,index) => <p key={`${line}-${index}`}>{line}</p>)}
          </div>
        </aside>

        {status !== 'active' && (
          <div className={`chesscom-debrief is-${status}`} role="dialog" aria-modal="true" aria-label="Resultado de operación">
            <span>{status === 'complete' ? 'MISSION COMPLETE' : 'MISSION FAILED'}</span>
            <strong>{status === 'complete' ? 'DUST VEIL · CLEAN ENOUGH' : 'DENIABLE ASSET LOST'}</strong>
            <p>{status === 'complete' ? 'Objetivo neutralizado, dossier recuperado y ruta de extracción alcanzada. El gobierno continúa sin conocerte.' : 'La célula ha dejado de responder. Oficialmente nunca estuvo allí.'}</p>
            <button type="button" onClick={resetMission}>{status === 'complete' ? 'Otra operación' : 'Reintentar'}</button>
          </div>
        )}
      </section>

      <footer className="chesscom-footer"><span>CHESS STUDIO · EXPERIMENTAL CELL</span><q>Good people, bad jobs.</q><small>POC: sin rating, sin persistencia, sin consecuencias fuera de este modo.</small></footer>
    </div>
  );
}
