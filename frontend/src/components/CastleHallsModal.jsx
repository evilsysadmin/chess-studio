import { requestHistoryGameOpen } from '../historyNavigation.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './CastleHallsModal.css';
import './HomeCastleHallsDoor.css';

function GalleryWall({ title, subtitle, entries, tone, onReviewGame }) {
  return (
    <section className={`castle-hall-wall hall-${tone}`} aria-label={title}>
      <header>
        <span className="section-label">{tone === 'fame' ? 'GALERÍA DE GLORIA' : 'GALERÍA DE LA VERGÜENZA'}</span>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>
      <div className="castle-hall-plaque-wall">
        {entries.length === 0 ? (
          <div className="castle-hall-empty">
            <span aria-hidden="true">{tone === 'fame' ? '♔' : '☠'}</span>
            <p>{tone === 'fame' ? 'La pared sigue esperando una hazaña que merezca piedra.' : 'Milagrosamente, no hay desastre suficientemente histórico que exponer.'}</p>
          </div>
        ) : entries.map((entry) => (
          <article className="castle-hall-plaque" key={entry.id} data-hall-entry={entry.id} data-hall-evidence={entry.evidence?.type || ''}>
            <span className="castle-hall-plaque-glyph" aria-hidden="true">{entry.glyph}</span>
            <div>
              <b>{entry.label}</b>
              <p>{entry.detail}</p>
              {entry.date && <small>{new Date(entry.date).toLocaleDateString()}</small>}
            </div>
            {entry.sourceGameId && (
              <button type="button" onClick={() => onReviewGame(entry.sourceGameId)} aria-label={`Revisar partida: ${entry.label}`}>Revisar partida →</button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export default function CastleHallsModal({ gallery, onClose, onReviewGame = null }) {
  useEscapeToClose(onClose);
  const fame = Array.isArray(gallery?.fame) ? gallery.fame : [];
  const shame = Array.isArray(gallery?.shame) ? gallery.shame : [];
  const reviewGame = onReviewGame || requestHistoryGameOpen;

  return (
    <div className="castle-halls-backdrop" role="presentation" onClick={onClose}>
      <div className="castle-halls-shell" role="dialog" aria-modal="true" aria-label="Galerías del castillo" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar galerías">×</button>
        <div className="castle-halls-vault" aria-hidden="true"><i /><i /><i /></div>
        <header className="castle-halls-heading">
          <span className="eyebrow">ARCHIVO DE PIEDRA · HECHOS REALES</span>
          <h2>Los muros recuerdan</h2>
          <p>Solo entran partidas que dejaron pruebas suficientes. Matthias ha solicitado derecho de réplica. Denegado.</p>
        </header>
        <div className="castle-halls-corridor">
          <GalleryWall
            title="Hall of Fame"
            subtitle="Victorias difíciles, precisión excepcional y posiciones rescatadas del crematorio."
            entries={fame}
            tone="fame"
            onReviewGame={reviewGame}
          />
          <div className="castle-halls-divider" aria-hidden="true"><span>♟</span></div>
          <GalleryWall
            title="Hall of Shame"
            subtitle="Blunders monumentales y victorias que fueron lanzadas desde una almena."
            entries={shame}
            tone="shame"
            onReviewGame={reviewGame}
          />
        </div>
      </div>
    </div>
  );
}
