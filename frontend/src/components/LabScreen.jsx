import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { LAB_START_FEN, assertLegalLabPosition, fenFromLabState, parseLabPosition } from '../labPosition.js';
import Board from './Board.jsx';
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
    const raw=prompt('Pega un FEN completo o sólo la colocación de piezas:',fen); if(!raw)return;
    try { applyPosition(parseLabPosition(raw, turn)); }
    catch { setError('FEN/colocación inválida. El tablero ha rechazado el cadáver antes de que llegue al laboratorio.'); }
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
    <div className="menu-section"><div className="combat-heading-row"><span className="section-label">Laboratorio libre</span><MechanicTutorialHelp tutorialId="lab" /></div><h2>Construye una posición</h2><p className="hint-text">Coloca piezas, elige quién mueve y juégala contra la CPU. Es entrenamiento: no toca <GlossaryTerm term="ELO">ELO</GlossaryTerm>.</p></div>
    <div className="lab-toolbar">
      <div className="lab-brushes">{BRUSHES.map(p=><button key={p||'erase'} className={`lab-brush ${brush===p?'active':''}`} onClick={()=>setBrush(p)} title={p?'Colocar pieza':'Borrar'}>{p?GLYPH[p]:'⌫'}</button>)}</div>
      <button className="secondary-btn" onClick={resetInitial}>Posición inicial</button>
      <button className="secondary-btn" onClick={emptyBoard}>Vaciar</button>
      <button className="secondary-btn" onClick={applyFen}>Pegar FEN</button>
    </div>
    <div className="lab-board-editor">
      <Board fen={fen} orientation="white" onSquareClick={editSquare} />
    </div>
    <div className="lab-config">
      <label>Turno <select value={turn} onChange={e=>{setTurn(e.target.value);setEp('-');}}><option value="w">Blancas</option><option value="b">Negras</option></select></label>
      <label>Dificultad CPU <input type="range" min="0" max="100" value={difficulty} onChange={e=>setDifficulty(Number(e.target.value))}/><b>{difficulty}</b></label>
      <div className="lab-fen-readout">
        <span className="section-label"><GlossaryTerm term="FEN">FEN</GlossaryTerm> de la posición</span>
        <code>{fen}</code>
        <small>Notación portátil: piezas · turno · enroques · en passant · contador de 50 movimientos · número de jugada.</small>
      </div>
    </div>
    {error&&<p className="error-text">{error}</p>}
    <button className="primary-btn" onClick={launch}>Jugar esta posición</button>
  </div>;
}
