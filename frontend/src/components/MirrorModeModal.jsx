import { computeMirrorProfile } from '../mirrorMode.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import GlossaryTerm from './GlossaryTerm.jsx';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';

export default function MirrorModeModal({ onStart, onClose }) {
  useEscapeToClose(onClose);
  const profile = computeMirrorProfile();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card friendly-modal" role="dialog" aria-modal="true" aria-label="Rival fantasma" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <div className="combat-heading-row"><span className="eyebrow">Rival Fantasma</span><MechanicTutorialHelp tutorialId="rival-ghost" /></div>
        <h3>Juega contra una versión aproximada de tu estilo</h3>

        {!profile.ready ? (
          <>
            <p className="hint-text friendly-lead">
              Aún faltan datos: necesito 3 partidas normales y 3 autopsias antes de construir un rival sin inventarme media personalidad.
            </p>
            <div className="friendly-big-summary">Estilo <b>{profile.styleGamesSampled || 0}/3</b> · errores <b>{profile.errorGamesSampled || 0}/3</b></div>
            <button type="button" className="secondary-btn friendly-main-cta" onClick={onClose}>Entendido</button>
          </>
        ) : (
          <>
            <p className="hint-text friendly-lead">
              Fantasma listo · nivel <b>{profile.difficulty}</b> · confianza <b>{profile.confidence}</b>.
            </p>
            <button type="button" className="primary-btn friendly-main-cta" onClick={() => onStart(profile)}>
              Jugar contra mi fantasma
            </button>

            <details className="friendly-disclosure mirror-profile-details">
              <summary>Cómo se ha construido</summary>
              <div className="friendly-disclosure-body">
                <p className="hint-text">
                  Usa {profile.gamesSampled} partidas para estilo y {profile.errorGamesSampled} autopsias para calibrar errores. Tu peor jugada pierde de media <b>{profile.avgLoss}</b> <GlossaryTerm term="cp">centipawns</GlossaryTerm>. El motor sólo usa tu estilo para desempatar jugadas parecidas: no regala piezas porque tú lo hayas hecho alguna tarde infame.
                </p>
                <div className="career-mini-grid" style={{ marginTop: '0.7rem' }}>
                  <span><b>{profile.metrics.captures}%</b><small>capturas</small></span>
                  <span><b>{profile.metrics.pawns}%</b><small>movimientos de peón</small></span>
                  <span><b>{profile.metrics.queens}%</b><small>movimientos de dama</small></span>
                  <span><b>{profile.metrics.checks}%</b><small>jaques</small></span>
                  <span><b>{profile.metrics.castles}%</b><small>partidas con enroque</small></span>
                </div>
                <p className="hint-text" style={{ marginTop: '0.65rem' }}>Rasgos observados: <b>{profile.traits.join(' · ')}</b>.</p>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
