import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

const FILES=['a','b','c','d','e','f','g','h'];
const RANKS=['8','7','6','5','4','3','2','1'];
const GLYPH={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟','':''};
const BRUSHES=['','K','Q','R','B','N','P','k','q','r','b','n','p'];

function startMap(){
  const c=new Chess(); const map={};
  for(const rank of RANKS) for(const file of FILES){const sq=file+rank;const p=c.get(sq);if(p)map[sq]=p.color==='w'?p.type.toUpperCase():p.type;}
  return map;
}
function placement(map){
  return RANKS.map(rank=>{let out='',empty=0;for(const file of FILES){const v=map[file+rank]||'';if(!v){empty++;continue;}if(empty){out+=empty;empty=0;}out+=v;}if(empty)out+=empty;return out;}).join('/');
}
function parsePlacement(fen){
  const out={}; const part=String(fen||'').trim().split(/\s+/)[0]; const rows=part.split('/'); if(rows.length!==8)return null;
  for(let r=0;r<8;r++){let f=0;for(const ch of rows[r]){if(/[1-8]/.test(ch))f+=Number(ch);else{if(!/[prnbqkPRNBQK]/.test(ch)||f>7)return null;out[FILES[f]+RANKS[r]]=ch;f++;}}if(f!==8)return null;}return out;
}

export default function LabScreen({ onExit, onStart }){
  useEscapeToClose(onExit);
  const [map,setMap]=useState(()=>startMap()); const [brush,setBrush]=useState(''); const [turn,setTurn]=useState('w'); const [difficulty,setDifficulty]=useState(50); const [error,setError]=useState('');
  const fen=useMemo(()=>`${placement(map)} ${turn} - - 0 1`,[map,turn]);
  function applyFen(){
    const raw=prompt('Pega un FEN completo o sólo la colocación de piezas:',fen); if(!raw)return;
    const parsed=parsePlacement(raw); if(!parsed){setError('FEN/colocación inválida. El tablero ha rechazado el cadáver antes de que llegue al laboratorio.');return;}
    const fields=raw.trim().split(/\s+/); setMap(parsed); if(fields[1]==='b'||fields[1]==='w')setTurn(fields[1]); setError('');
  }
  function launch(){
    try{const c=new Chess(fen); if(!c.get('e1')&&!Object.values(map).includes('K'))throw new Error('Falta rey blanco'); if(!Object.values(map).includes('k'))throw new Error('Falta rey negro'); setError(''); onStart(c.fen(),turn,difficulty,{lab:true});}
    catch(e){setError(`Posición inválida: ${e.message}`);}
  }
  return <div className="menu tournament-panel lab-screen">
    <button className="back-link" onClick={onExit}>← Volver al menú</button>
    <div className="menu-section"><span className="section-label">Laboratorio libre</span><h2>Construye una posición</h2><p className="hint-text">Coloca piezas, elige quién mueve y juégala contra la CPU. Es entrenamiento: no toca ELO.</p></div>
    <div className="lab-toolbar">
      <div className="lab-brushes">{BRUSHES.map(p=><button key={p||'erase'} className={`lab-brush ${brush===p?'active':''}`} onClick={()=>setBrush(p)} title={p?'Colocar pieza':'Borrar'}>{p?GLYPH[p]:'⌫'}</button>)}</div>
      <button className="secondary-btn" onClick={()=>setMap(startMap())}>Posición inicial</button>
      <button className="secondary-btn" onClick={()=>setMap({e1:'K',e8:'k'})}>Vaciar</button>
      <button className="secondary-btn" onClick={applyFen}>Pegar FEN</button>
    </div>
    <div className="lab-board" role="grid">{RANKS.flatMap((rank,ri)=>FILES.map((file,fi)=>{const sq=file+rank;return <button key={sq} className={`lab-square ${(ri+fi)%2?'dark':'light'}`} onClick={()=>setMap(prev=>({...prev,[sq]:brush||undefined}))} aria-label={sq}>{GLYPH[map[sq]||'']}</button>}))}</div>
    <div className="lab-config">
      <label>Turno <select value={turn} onChange={e=>setTurn(e.target.value)}><option value="w">Blancas</option><option value="b">Negras</option></select></label>
      <label>Dificultad CPU <input type="range" min="0" max="100" value={difficulty} onChange={e=>setDifficulty(Number(e.target.value))}/><b>{difficulty}</b></label>
      <code>{fen}</code>
    </div>
    {error&&<p className="error-text">{error}</p>}
    <button className="primary-btn" onClick={launch}>Jugar esta posición</button>
  </div>;
}
