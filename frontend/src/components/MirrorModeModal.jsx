import React from 'react';
import { computeMirrorProfile } from '../mirrorMode.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function MirrorModeModal({ onStart, onClose }) {
  useEscapeToClose(onClose);
  const profile = computeMirrorProfile();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">Espejo de ti mismo</span>
        <h3>Una CPU calibrada a tus propios errores</h3>

        {!profile.ready ? (
          <>
            <p className="hint-text" style={{ marginBottom: '0.8rem' }}>
              Todavía no hay suficientes datos — se necesitan al menos 3 partidas analizadas
              (con "Buscar mi peor jugada de siempre" en "Así juegas") para calcular un perfil
              confiable. Llevas {profile.gamesSampled} de 3.
            </p>
            <button type="button" className="secondary-btn" style={{ width: '100%' }} onClick={onClose}>
              Entendido
            </button>
          </>
        ) : (
          <>
            <p className="hint-text" style={{ marginBottom: '0.8rem' }}>
              No es un motor de reconocimiento de patrones — no imita el <i>tipo</i> de error que
              cometes, sino qué tan seguido y qué tan grave. Se calcula sobre tus{' '}
              {profile.gamesSampled} partidas ya analizadas: perdiste en promedio{' '}
              <b>{profile.avgLoss}</b> puntos de evaluación en tu peor jugada de cada una — la CPU
              va a jugar a nivel <b>{profile.difficulty}</b>, calibrada para blandir errores de un
              tamaño parecido al tuyo.
            </p>
            <button
              type="button"
              className="primary-btn"
              style={{ width: '100%' }}
              onClick={() => onStart(profile.difficulty)}
            >
              Empezar partida espejo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
