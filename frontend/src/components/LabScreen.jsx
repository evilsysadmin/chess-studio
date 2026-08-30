import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { LAB_START_FEN, assertLegalLabPosition, fenFromLabState, parseLabPosition } from '../labPosition.js';
import Board from './Board.jsx';
import ArenaExperiment from './ArenaExperiment.jsx';
import GlossaryTerm from './GlossaryTerm.jsx';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';

const GLYPH={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟','':''};
const BRUSHES=['','K','Q','R','B','N','P','k','q','r','b','n','p'];

function initialState() {
  return parseLabPosition(LAB_START_FEN);
}

export default function LabScreen({ onExit, onStart }){
  useEscapeToClose(onExit);
  const initial = initialState();
  const [labMode,setLabMode]=useState('position');
  const [map,setMap]=useState(initial.map);
  const [brush,setBrush]=useState('');
  const [turn,setTurn]=useState(initial.turn);
  const [castling,setCastling]=useState(initial.castling);
  const [ep,setEp]=useState(initial.ep);
  const [halfmove,setHalfmove]=useState(initial.halfmove);
  const [fullmove,setFullmove]=useState(initial.fullmove);
  const [difficulty,setDifficulty]=useState(50);
  const [error,setError]=useState('');

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
    // Al editar a mano ya no conocemos la historia de rey/torres ni el último
    // doble paso de peón. Es más seguro borrar esos derechos que inventarlos.
    setCastling('-'); setEp('-'); setHalfmove('0'); setFullmove('1');
  }

  function emptyBoard() {
    setMap({e1:'K',e8:'k'}); setCastling('-'); setEp('-'); setHalfmove('0'); setFullmove('1'); setError('');
  }

  function launch(){
    try{const legal=assertLegalLabPosition(fen,turn); const c=new Chess(legal.fen); setError(''); onStart(c.fen(),c.turn(),difficulty,{lab:true});}
    catch(e){setError(`Posición inválida: ${e.message}`);}
  }

  return <div className="menu tournament-panel lab-screen">
    <button className="back-link" onClick={onExit}>← Volver al menú</button>
    <div className="menu-section friendly-primary-zone">
      <div className="combat-heading-row"><span className="section-label">Laboratorio libre</span><MechanicTutorialHelp tutorialId={labMode==='arena'?'arena-terrain':'lab'} /></div>
      <h2>{labMode==='arena'?'Arenas experimentales':'Prepara una posición y juega'}</h2>
      <p className="hint-text friendly-lead">{labMode==='arena'?'Geometría que rompe el tablero sin tocar el ajedrez normal. Aquí es donde hacemos barbaridades con casco y gafas.':'Coloca las piezas en el tablero y empieza desde ahí. No afecta a tu rating competitivo.'}</p>
      <div className="lab-mode-switch" role="tablist" aria-label="Herramientas del laboratorio">
        <button type="button" role="tab" aria-selected={labMode==='position'} className={labMode==='position'?'active':''} onClick={()=>setLabMode('position')}>Posición normal</button>
        <button type="button" role="tab" aria-selected={labMode==='arena'} className={labMode==='arena'?'active':''} onClick={()=>setLabMode('arena')}>⚠ Arena experimental</button>
      </div>
    </div>

    {labMode==='arena' ? <ArenaExperiment /> : <>
      <div className="lab-toolbar">
        <div className="lab-brushes">{BRUSHES.map(p=><button key={p||'erase'} className={`lab-brush ${brush===p?'active':''}`} onClick={()=>setBrush(p)} title={p?'Colocar pieza':'Borrar'}>{p?GLYPH[p]:'⌫'}</button>)}</div>
        <button className="secondary-btn" onClick={resetInitial}>Posición inicial</button>
        <button className="secondary-btn" onClick={emptyBoard}>Vaciar</button>
      </div>
      <div className="lab-board-editor">
        <Board fen={fen} orientation="white" onSquareClick={editSquare} />
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
  </div>;
}
