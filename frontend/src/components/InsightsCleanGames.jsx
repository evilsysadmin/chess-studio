import { CLEAN_GAME_MIN_ANALYZED_MOVES, cleanGameSummary } from '../cleanGames.js';

export default function InsightsCleanGames() {
  const summary = cleanGameSummary();

  return (
    <section className="menu-section" aria-labelledby="clean-games-title">
      <div className="insights-recurring-errors-heading">
        <div>
          <span className="section-label">Calidad demostrada</span>
          <h2 id="clean-games-title">Partidas limpias</h2>
          <p className="hint-text">Sólo cuenta una autopsia con al menos {CLEAN_GAME_MIN_ANALYZED_MOVES} jugadas tuyas revisadas y cero mistakes/blunders, mates omitidos o regalos inmediatos de pieza mayor o menor.</p>
        </div>
        {summary.eligible > 0 ? <strong>{summary.clean}/{summary.eligible}</strong> : null}
      </div>

      {summary.eligible > 0 ? (
        <div className="career-mini-grid" data-clean-game-summary="true">
          <span><b>{summary.rate}%</b><small>autopsias elegibles limpias</small></span>
          <span><b>{summary.currentStreak}</b><small>racha limpia actual</small></span>
          <span><b>{summary.bestStreak}</b><small>mejor racha limpia</small></span>
          <span><b>{summary.latest?.clean ? 'Limpia' : 'Con incidencias'}</b><small>última autopsia con muestra suficiente</small></span>
        </div>
      ) : (
        <div className="insights-recurring-errors-empty">
          <strong>Aún no hay muestra suficiente.</strong>
          <p className="hint-text">Abre la autopsia después de tus partidas. Las antiguas sin evidencia completa no reciben el sello retroactivamente.</p>
        </div>
      )}
    </section>
  );
}
