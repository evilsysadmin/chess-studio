import { CLEAN_GAME_MIN_ANALYZED_MOVES, loadCleanGameRecords } from '../cleanGames.js';
import { buildPlayerModel } from '../playerModel.js';

export default function InsightsCleanGames({ playerModel: sharedPlayerModel = null }) {
  const playerModel = sharedPlayerModel || buildPlayerModel({ cleanGameRecords: loadCleanGameRecords() });
  const cleanPlay = playerModel.cleanPlay;
  const positiveDecisions = playerModel.positiveDecisions;
  const hasRepeatedPositiveEvidence = positiveDecisions?.gamesWithPreferredMoves >= 2;

  return (
    <section className="menu-section" aria-labelledby="clean-games-title">
      <div className="insights-recurring-errors-heading">
        <div>
          <span className="section-label">Calidad demostrada</span>
          <h2 id="clean-games-title">Partidas limpias</h2>
          <p className="hint-text">Sólo cuenta una autopsia con al menos {CLEAN_GAME_MIN_ANALYZED_MOVES} jugadas tuyas revisadas y cero mistakes/blunders, mates omitidos o regalos inmediatos de pieza mayor o menor.</p>
        </div>
        {cleanPlay.eligibleGames > 0 ? <strong>{cleanPlay.cleanGames}/{cleanPlay.eligibleGames}</strong> : null}
      </div>

      {cleanPlay.eligibleGames > 0 ? (
        <div className="career-mini-grid" data-clean-game-summary="true">
          <span><b>{cleanPlay.cleanRate}%</b><small>autopsias elegibles limpias</small></span>
          <span><b>{cleanPlay.currentStreak}</b><small>racha limpia actual</small></span>
          <span><b>{cleanPlay.bestStreak}</b><small>mejor racha limpia</small></span>
          <span><b>{cleanPlay.latestEligibleClean ? 'Limpia' : 'Con incidencias'}</b><small>última autopsia con muestra suficiente</small></span>
        </div>
      ) : (
        <div className="insights-recurring-errors-empty">
          <strong>Aún no hay muestra suficiente.</strong>
          <p className="hint-text">Abre la autopsia después de tus partidas. Las antiguas sin evidencia completa no reciben el sello retroactivamente.</p>
        </div>
      )}

      {hasRepeatedPositiveEvidence ? (
        <p className="hint-text" data-positive-decision-evidence="true">
          También hay evidencia positiva: en {positiveDecisions.enginePreferredMoves} de {positiveDecisions.comparedMoves} jugadas comparables elegiste exactamente la primera opción del motor, repartidas en {positiveDecisions.gamesWithPreferredMoves} autopsias.
        </p>
      ) : null}
    </section>
  );
}