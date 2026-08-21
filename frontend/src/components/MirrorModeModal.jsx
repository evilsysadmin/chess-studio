import React from 'react';
import { computeMirrorProfile } from '../mirrorMode.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import GlossaryTerm from './GlossaryTerm.jsx';

export default function MirrorModeModal({ onStart, onClose }) {
  useEscapeToClose(onClose);
  const profile = computeMirrorProfile();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">Rival Fantasma</span>
        <h3>La CPU intenta parecerse a cómo juegas tú</h3>

        {!profile.ready ? (
          <>
            <p className="hint-text" style={{ marginBottom: '0.8rem' }}>
              No voy a inventarme un clon con tres migas de datos. Necesito al menos 3 partidas normales
              archivadas y 3 partidas con autopsia de peor jugada. Ahora hay {profile.styleGamesSampled || 0}/3
              para estilo y {profile.errorGamesSampled || 0}/3 para calibrar errores.
            </p>
            <button type="button" className="secondary-btn" style={{ width: '100%' }} onClick={onClose}>
              Entendido
            </button>
          </>
        ) : (
          <>
            <p className="hint-text" style={{ marginBottom: '0.8rem' }}>
              Perfil de confianza <b>{profile.confidence}</b>, calculado con {profile.gamesSampled} partidas de
              estilo y {profile.errorGamesSampled} autopsias. Tu peor jugada pierde en promedio <b>{profile.avgLoss}</b>
              {' '}<GlossaryTerm term="cp">centipawns</GlossaryTerm>; el fantasma queda en nivel <b>{profile.difficulty}</b>. El motor sólo usa tu estilo
              para desempatar jugadas casi equivalentes: no regalará una torre por hacer cosplay de tus peores tardes.
            </p>

            <div className="career-mini-grid" style={{ marginBottom: '0.8rem' }}>
              <span><b>{profile.metrics.captures}%</b><small>jugadas con captura</small></span>
              <span><b>{profile.metrics.pawns}%</b><small>movimientos de peón</small></span>
              <span><b>{profile.metrics.queens}%</b><small>movimientos de dama</small></span>
              <span><b>{profile.metrics.checks}%</b><small>jugadas con jaque</small></span>
              <span><b>{profile.metrics.castles}%</b><small>partidas con enroque</small></span>
            </div>

            <p className="hint-text" style={{ marginBottom: '0.8rem' }}>
              Rasgos observados: <b>{profile.traits.join(' · ')}</b>.
            </p>
            <button
              type="button"
              className="primary-btn"
              style={{ width: '100%' }}
              onClick={() => onStart(profile)}
            >
              Jugar contra mi fantasma
            </button>
          </>
        )}
      </div>
    </div>
  );
}
