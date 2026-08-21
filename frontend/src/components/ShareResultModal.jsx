import React, { useMemo, useState } from 'react';
import { buildShareText, buildShareUrl, normalizeShareRecord } from '../shareResult.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

const OUTCOME = { win: 'Victoria', loss: 'Derrota', draw: 'Tablas' };

export default function ShareResultModal({ record, onClose }) {
  useEscapeToClose(onClose);
  const [feedback, setFeedback] = useState('');
  const data = useMemo(() => normalizeShareRecord(record), [record]);
  const text = useMemo(() => buildShareText(record), [record]);
  const url = useMemo(() => buildShareUrl(record), [record]);

  async function copy(value, message) {
    try { await navigator.clipboard.writeText(value); setFeedback(message); }
    catch { setFeedback('No pude acceder al portapapeles. El navegador se ha puesto exquisito.'); }
  }

  async function downloadCard() {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
    const ctx = canvas.getContext('2d'); const bg = ctx.createLinearGradient(0,0,1200,630); bg.addColorStop(0,'#151713'); bg.addColorStop(1,'#282218'); ctx.fillStyle=bg;ctx.fillRect(0,0,1200,630);
    ctx.fillStyle='#d8c08b';ctx.font='700 34px serif';ctx.fillText(data.incident?'CHESS STUDIO · CÁMARA DEL CRIMEN':'CHESS STUDIO · ACTA DE PARTIDA',70,80);
    ctx.fillStyle=data.outcome==='win'?'#d9c978':data.outcome==='loss'?'#c87c70':'#b7b7a8';ctx.font='800 78px serif';ctx.fillText(data.incident?'PRUEBA FORENSE':(OUTCOME[data.outcome]||data.outcome),70,190);
    ctx.fillStyle='#f1ead8';ctx.font='600 38px sans-serif';ctx.fillText(`contra CPU · nivel ${data.difficulty}`,74,250);
    ctx.fillStyle='#c7bea8';ctx.font='30px sans-serif';ctx.fillText(`${data.moves.length} jugadas · ${data.humanColor==='w'?'Blancas':'Negras'}${data.timeControl?.label?` · ${data.timeControl.label}`:''}`,74,310);
    if(data.incident){ctx.fillStyle='#f1ead8';ctx.font='600 30px serif';ctx.fillText(`Jugada ${data.incident.moveNumber}: ${data.incident.played} · −${data.incident.loss} cp`,74,370);ctx.font='25px sans-serif';ctx.fillStyle='#c7bea8';ctx.fillText(`Motor: ${data.incident.suggested}`,74,414);}
    else if(data.opening){ctx.font='28px serif';ctx.fillText(data.opening.slice(0,62),74,365);}
    if(data.series&&!data.incident){ctx.font='26px sans-serif';ctx.fillText(`Serie: Tú ${data.series.humanWins} · CPU ${data.series.cpuWins}${data.series.draws?` · tablas ${data.series.draws}`:''}`,74,420);}
    ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(74,470,1050,2);ctx.fillStyle='#9d9583';ctx.font='24px sans-serif';ctx.fillText(data.incident?'Aquí fue donde la dignidad abandonó la posición.':'Pruebas documentales. Para chulear o solicitar apoyo emocional.',74,525);ctx.font='96px serif';ctx.fillStyle='#d8c08b';ctx.fillText('♟',1010,125);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob){setFeedback('No se pudo generar la tarjeta.');return;}const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=`chess-studio-${data.incident?'crimen':data.outcome}-${new Date().toISOString().slice(0,10)}.png`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(href);setFeedback('Tarjeta PNG generada. Munición social preparada.');
  }

  async function nativeShare(){if(!navigator.share){await copy(`${text}\n\n${url}`,'Resumen y enlace copiados.');return;}try{await navigator.share({title:data.incident?'Chess Studio · Cámara del crimen':'Chess Studio · Resultado',text,url});setFeedback('Compartido. Que empiece la chulería o el velatorio.');}catch(error){if(error?.name!=='AbortError')setFeedback('No se pudo abrir el diálogo de compartir.');}}

  return (
    <div className="modal-backdrop share-result-backdrop" onClick={onClose}>
      <div className="army-card share-result-modal" onClick={(event) => event.stopPropagation()}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <header className="share-result-header">
          <span className="eyebrow">Pruebas documentales</span>
          <h3>{data.incident ? 'Compartir el desastre' : 'Compartir partida'}</h3>
        </header>

        <div className={`share-result-card ${data.outcome}`}>
          <div className="share-result-mark">♟</div>
          <div className="share-result-summary">
            <strong>{data.incident ? 'Cámara del crimen' : OUTCOME[data.outcome] || data.outcome}</strong>
            <span>contra CPU · nivel {data.difficulty}</span>
          </div>
          <div className="share-result-stats">
            <span>{data.moves.length} jugadas</span>
            <span>{data.humanColor === 'w' ? 'Blancas' : 'Negras'}</span>
            {data.timeControl?.label && <span>{data.timeControl.label}</span>}
          </div>
          {data.incident ? (
            <p>Jugada {data.incident.moveNumber}: <b>{data.incident.played}</b> en vez de <b>{data.incident.suggested}</b> · −{data.incident.loss} cp</p>
          ) : data.opening ? <p>{data.opening}</p> : null}
          {data.series && !data.incident && <p>Serie: Tú {data.series.humanWins} · CPU {data.series.cpuWins}{data.series.draws ? ` · tablas ${data.series.draws}` : ''}</p>}
        </div>

        <p className="hint-text share-result-privacy">El enlace contiene sólo datos de esta partida. No incluye sesión, JWT ni perfil.</p>
        <div className="share-result-actions">
          <button className="primary-btn" onClick={nativeShare}>Compartir</button>
          <button className="secondary-btn" onClick={() => copy(url,'Enlace copiado.')}>Copiar enlace</button>
          <button className="secondary-btn" onClick={() => copy(text,'Resumen copiado.')}>Copiar resumen</button>
          <button className="secondary-btn" onClick={downloadCard}>Tarjeta PNG</button>
        </div>
        {feedback && <p className="hint-text share-feedback">{feedback}</p>}
      </div>
    </div>
  );
}
