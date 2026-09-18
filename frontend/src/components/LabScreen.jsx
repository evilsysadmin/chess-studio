import { lazy, Suspense, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { consumeLabLaunch } from '../labLaunchIntent.js';
import { EXPERIMENT_MATURITY, experimentMaturityLabel } from '../experimentMaturity.js';
import { LAB_START_FEN, assertLegalLabPosition, fenFromLabState, parseLabPosition } from '../labPosition.js';
import experimentsRoomCanonical from '../assets/experiments-room-canonical.webp';
import PreferredBoard from './PreferredBoard.jsx';
import GlossaryTerm from './GlossaryTerm.jsx';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import './LabScreen.css';
import './LabArcade.css';
import './LabWorkshop.css';
import './LabWorkshopHotfix.css';

const ArenaExperiment = lazy(() => import('./ArenaExperiment.jsx'));
const PawnTrailblazer = lazy(() => import('./PawnTrailblazer.jsx'));
const PawnSlugGodotHost = lazy(() => import('./PawnSlugGodotHost.jsx'));
const Chesscom = lazy(() => import('./Chesscom.jsx'));
const ChroniclesOfMatthias = lazy(() => import('./ChroniclesOfMatthias.jsx'));
const ChroniclesOfMatthiasTactics = lazy(() => import('./ChroniclesOfMatthiasTactics.jsx'));

const GLYPH={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟','':''};
const BRUSHES=['','K','Q','R','B','N','P','k','q','r','b','n','p'];

function initialState() {
  return parseLabPosition(LAB_START_FEN);
}

function LabModeFallback() {
  return <div className="menu tournament-panel lab-screen"><p className="hint-text friendly-lead">Cargando experimento…</p></div>;
}

export default function LabScreen({ onExit, onStart }){
  const initial = initialState();
  const [labMode,setLabMode]=useState(() => consumeLabLaunch() || 'hub');
  const [map,setMap]=useState(initial.map);
  const [brush,setBrush]=useState('');
  const [turn,setTurn]=useState(initial.turn);
  const [castling,setCastling]=useState(initial.castling);
  const [ep,setEp]=useState(initial.ep);
  const [halfmove,setHalfmove]=useState(initial.halfmove);
  const [fullmove,setFullmove]=useState(initial.fullmove);
  const [difficulty,setDifficulty]=useState(50);
  const [error,setError]=useState('');

  const childOwnsBack = labMode==='trailblazer' || labMode==='pawnslug-godot' || labMode==='chesscom' || labMode==='chronicles' || labMode==='chronicles-tactics';
  useEscapeToClose(() => labMode==='hub' ? onExit() : setLabMode('hub'), { disabled: childOwnsBack });

  const fen=useMemo(()=>fenFromLabState({map,turn,castling,ep,halfmove,fullmove}),[map,turn,castling,ep,halfmove,fullmove]);

  function applyPosition(next) {
    setMap(next.map); setTurn(next.turn); setCastling(next.castling); setEp(next.ep);
    setHalfmove(next.halfmove); setFullmove(next.fullmove); setError('');
  }

  function resetInitial() { applyPosition(initialState()); }

  function applyFen(){
    const raw=prompt('Pega una posición en formato FEN:',fen); if(!raw)return;
    try { applyPosition(parseLabPosition(raw, turn)); }
    catch { setError('La posición no es válida. Revisa el texto e inténtalo de nuevo.'); }
  }

  function editSquare(sq) {
    setMap((prev)=>{const next={...prev};if(brush)next[sq]=brush;else delete next[sq];return next;});
    setCastling('-'); setEp('-'); setHalfmove('0'); setFullmove('1');
  }

  function emptyBoard() {
    setMap({e1:'K',e8:'k'}); setCastling('-'); setEp('-'); setHalfmove('0'); setFullmove('1'); setError('');
  }

  function launch(){
    try{const legal=assertLegalLabPosition(fen,turn); const c=new Chess(legal.fen); setError(''); onStart(c.fen(),c.turn(),difficulty,{lab:true});}
    catch(e){setError(`Posición inválida: ${e.message}`);}
  }

  if (labMode==='trailblazer') return <Suspense fallback={<LabModeFallback />}><PawnTrailblazer onExit={()=>setLabMode('hub')} /></Suspense>;
  if (labMode==='pawnslug-godot') return <Suspense fallback={<LabModeFallback />}><PawnSlugGodotHost onExit={()=>setLabMode('hub')} /></Suspense>;
  if (labMode==='chesscom') return <Suspense fallback={<LabModeFallback />}><Chesscom onExit={()=>setLabMode('hub')} /></Suspense>;
  if (labMode==='chronicles') return <Suspense fallback={<LabModeFallback />}><ChroniclesOfMatthias onExit={()=>setLabMode('hub')} /></Suspense>;
  if (labMode==='chronicles-tactics') return <Suspense fallback={<LabModeFallback />}><ChroniclesOfMatthiasTactics onExit={()=>setLabMode('hub')} /></Suspense>;

  return <div className="menu tournament-panel lab-screen">
    <button className="back-link" onClick={labMode==='hub'?onExit:()=>setLabMode('hub')}>← {labMode==='hub'?'Volver al menú':'Experimentos geniales'}</button>

    {labMode==='hub' ? (
      <div className="lab-workshop" style={{ width: '100%' }}>
        <img className="lab-workshop-art" src={experimentsRoomCanonical} alt="" aria-hidden="true" />
        <header className="lab-workshop-masthead">
          <div>
            <div className="lab-workshop-kicker">Ala prohibida · taller de Matthias</div>
            <h2>Experimentos geniales</h2>
            <p>Prototipos, aventuras y barbaridades controladas; ninguno es necesario para disfrutar Chess Studio. Precisamente por eso aquí podemos romper cosas con cierta elegancia.</p>
          </div>
          <span className="lab-workshop-seal" aria-hidden="true">M</span>
        </header>

        <section className="lab-workshop-wing lab-workshop-wing--crypt" style={{ zIndex: 'auto' }} aria-labelledby="lab-crypt-title">
          <div className="lab-workshop-wing-copy">
            <small>Bajo el castillo</small>
            <h3 id="lab-crypt-title">La cripta</h3>
            <p>Donde Matthias convierte una mala idea en campaña y después niega cualquier responsabilidad.</p>
          </div>
          <div className="lab-workshop-portals">
            <button type="button" className="lab-workshop-portal lab-workshop-portal--arch lab-workshop-portal--chronicles" data-glyph="♟" onClick={()=>setLabMode('chronicles')}>
              <small>{experimentMaturityLabel(EXPERIMENT_MATURITY.POC, 'Book I')}</small>
              <strong>Chronicles of Matthias</strong>
              <span>Dungeon crawler 3D en primera persona. Grupo de cuatro, combate por casillas y una cripta que piensa como un tablero.</span>
              <b>Descender a la cripta</b>
            </button>
            <button type="button" className="lab-workshop-portal lab-workshop-portal--arch lab-workshop-portal--tactics" data-glyph="♞" aria-label="Abrir Tactics RPG isométrico" onClick={()=>setLabMode('chronicles-tactics')}>
              <small>{experimentMaturityLabel(EXPERIMENT_MATURITY.POC, 'táctico por turnos')}</small>
              <strong>Chronicles of Matthias Tactics</strong>
              <span>La compañía sale al tablero: vista isométrica, formación visible y criaturas con su propio turno.</span>
              <b>Abrir la mesa táctica</b>
            </button>
          </div>
        </section>

        <section className="lab-workshop-wing lab-workshop-wing--hangar" style={{ zIndex: 'auto' }} aria-labelledby="lab-hangar-title">
          <div className="lab-workshop-wing-copy">
            <small>Hangar B</small>
            <h3 id="lab-hangar-title">Ruido y pólvora</h3>
            <p>Una zona perfectamente segura según el mismo hombre que puso un cañón delante de un peón.</p>
          </div>
          <div className="lab-workshop-portals">
            <button type="button" className="lab-workshop-portal lab-workshop-portal--shutter lab-workshop-portal--pawnslug-godot" data-glyph="G" onClick={()=>setLabMode('pawnslug-godot')}>
              <small>{experimentMaturityLabel(EXPERIMENT_MATURITY.POC, 'Godot Web')}</small>
              <strong>PAWN SLUG GODOT</strong>
              <span>Runtime canónico con motor propio: Godot manda; React sólo abre la puerta.</span>
              <b>Entrar en operación</b>
            </button>
            <button type="button" className="lab-workshop-portal lab-workshop-portal--shutter lab-workshop-portal--trailblazer" data-glyph="♙" onClick={()=>setLabMode('trailblazer')}>
              <small>{experimentMaturityLabel(EXPERIMENT_MATURITY.POC, 'jugable')}</small>
              <strong>Pawn Trailblazer</strong>
              <span>Plataformas y exploración; el movimiento se abre, los ataques siguen siendo de peón.</span>
              <b>Vorwärts</b>
            </button>
          </div>
        </section>

        <section className="lab-workshop-wing lab-workshop-wing--ops" style={{ zIndex: 'auto' }} aria-labelledby="lab-ops-title">
          <div className="lab-workshop-wing-copy">
            <small>Sala de operaciones</small>
            <h3 id="lab-ops-title">Banco de pruebas</h3>
            <p>Táctica, posiciones imposibles y geometría sospechosa. Aquí las normas entran con casco.</p>
          </div>
          <div className="lab-workshop-ops">
            <button type="button" className="lab-workshop-map-table" onClick={()=>setLabMode('chesscom')}>
              <small>{experimentMaturityLabel(EXPERIMENT_MATURITY.EXPERIMENTAL, 'en pulido')}</small>
              <strong>Chesscom</strong>
              <span>Escaramuzas tácticas con cobertura, AP, intel y extracción. La presentación sigue en fase de pulido.</span>
              <b>Operation Dust Veil →</b>
            </button>
            <div className="lab-workshop-bench" aria-label="Herramientas del banco de pruebas">
              <span className="lab-workshop-bench-title">Instrumentos autorizados con reservas</span>
              <button type="button" className="lab-workshop-tool" onClick={()=>setLabMode('position')}>
                <span>
                  <small className="lab-workshop-tool-meta">{experimentMaturityLabel(EXPERIMENT_MATURITY.MATURE, 'herramienta')}</small>
                  <strong>Laboratorio libre</strong>
                </span>
                <b aria-hidden="true">›</b>
              </button>
              <button type="button" className="lab-workshop-tool lab-workshop-tool--arena" onClick={()=>setLabMode('arena')}>
                <span>
                  <small className="lab-workshop-tool-meta">{experimentMaturityLabel(EXPERIMENT_MATURITY.EXPERIMENTAL, 'variante')}</small>
                  <strong>Arenas experimentales</strong>
                </span>
                <b aria-hidden="true">›</b>
              </button>
            </div>
          </div>
        </section>
      </div>
    ) : <>
      <div className="menu-section friendly-primary-zone">
        <div className="combat-heading-row"><span className="section-label">Laboratorio libre</span><MechanicTutorialHelp tutorialId="lab" /></div>
        <h2>{labMode==='arena'?'Arenas experimentales':'Prepara una posición y juega'}</h2>
        <p className="hint-text friendly-lead">{labMode==='arena'?'Geometría que rompe el tablero sin tocar el ajedrez normal. Aquí es donde hacemos barbaridades con casco y gafas.':'Coloca las piezas en el tablero y empieza desde ahí. No afecta a tu rating competitivo.'}</p>
        <div className="career-section-nav" role="tablist" aria-label="Herramientas del laboratorio">
          <button type="button" role="tab" aria-selected={labMode==='position'} className={labMode==='position'?'active':''} onClick={()=>setLabMode('position')}>Posición normal</button>
          <button type="button" role="tab" aria-selected={labMode==='arena'} className={labMode==='arena'?'active':''} onClick={()=>setLabMode('arena')}>⚠ Arena experimental</button>
        </div>
      </div>

      {labMode==='arena' ? <Suspense fallback={<p className="hint-text friendly-lead">Cargando Arena…</p>}><ArenaExperiment /></Suspense> : <>
        <div className="lab-toolbar">
          <div className="lab-brushes">{BRUSHES.map(p=><button key={p||'erase'} className={`lab-brush ${brush===p?'active':''}`} onClick={()=>setBrush(p)} title={p?'Colocar pieza':'Borrar'}>{p?GLYPH[p]:'⌫'}</button>)}</div>
          <button className="secondary-btn" onClick={resetInitial}>Posición inicial</button>
          <button className="secondary-btn" onClick={emptyBoard}>Vaciar</button>
        </div>
        <div className="lab-board-editor">
          <PreferredBoard fen={fen} orientation="white" onSquareClick={editSquare} />
        </div>
        <div className="lab-config lab-config-friendly">
          <label>Turno <select value={turn} onChange={e=>{setTurn(e.target.value);setEp('-');}}><option value="w">Blancas</option><option value="b">Negras</option></select></label>
          <label>Dificultad CPU <input type="range" min="0" max="100" value={difficulty} onChange={e=>setDifficulty(Number(e.target.value))}/><b>{difficulty}</b></label>
        </div>
        {error&&<p className="error-text">{error}</p>}
        <button className="primary-btn friendly-main-cta" onClick={launch}>Jugar esta posición</button>
        <details className="friendly-disclosure lab-technical-details">
          <summary>Opciones avanzadas de la posición</summary>
          <div className="friendly-disclosure-body lab-fen-readout">
            <button className="secondary-btn" onClick={applyFen}>Importar posición en formato FEN</button>
            <span className="section-label"><GlossaryTerm term="FEN">FEN</GlossaryTerm></span>
            <code>{fen}</code>
            <small>Piezas · turno · enroques · en passant · contador de 50 movimientos · número de jugada.</small>
          </div>
        </details>
      </>}
    </>}
  </div>;
}
