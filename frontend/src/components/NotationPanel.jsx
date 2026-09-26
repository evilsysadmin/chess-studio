import { difficultyLabel } from '../difficulty.js';
import { formatLongMove } from '../notation.js';
import { identifyOpening } from '../openings.js';

const REVIEW_MARK = Object.freeze({
  ok: { mark: '✓', label: 'Cercana a la ideal' },
  inaccuracy: { mark: '?!', label: 'Imprecisión' },
  mistake: { mark: '?', label: 'Error' },
  blunder: { mark: '??', label: 'Blunder' },
});

function reviewMap(report) {
  return new Map((report?.moveReports || []).map((row) => [Number(row.index), row]));
}

function MoveCell({ move, index, className, reviews }) {
  if (!move) return <span className={className} />;
  const review = reviews.get(index);
  const meta = review ? REVIEW_MARK[review.severity] || REVIEW_MARK.ok : null;
  const title = review
    ? `${move.san || ''} · ${meta.label} · ideal ${review.suggested || '—'} · −${Math.max(0, Number(review.loss || 0))} cp`
    : move.san;
  return (
    <span className={`${className}${review ? ` notation-reviewed sev-${review.severity || 'ok'}` : ''}`} title={title}>
      {formatLongMove(move)}
      {meta && <small className="notation-review-mark" aria-label={meta.label}>{meta.mark}</small>}
    </span>
  );
}

function toPairs(history) {
  const pairs = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      num: i / 2 + 1,
      white: history[i],
      black: history[i + 1],
      whiteIndex: i,
      blackIndex: i + 1,
    });
  }
  return pairs;
}

export default function NotationPanel({ history, difficulty, analysisReport = null }) {
  const pairs = toPairs(history);
  const opening = identifyOpening(history.map((m) => m.san));
  const reviews = reviewMap(analysisReport);
  const reviewed = reviews.size > 0;

  return (
    <aside className="notation-panel">
      <h3>Cuaderno de jugadas</h3>
      {opening && <p className="opening-tag">{opening}</p>}
      {reviewed && <p className="notation-review-legend">Revisión minimax · ✓ precisa · ?! imprecisión · ? error · ?? blunder</p>}
      <div className="notation-list">
        {pairs.length === 0 && <p className="notation-empty">Todavía no se movió ninguna pieza.</p>}
        {pairs.map((p) => (
          <div className="notation-row" key={p.num}>
            <span className="num">{p.num}.</span>
            <MoveCell move={p.white} index={p.whiteIndex} className="white-move" reviews={reviews} />
            <MoveCell move={p.black} index={p.blackIndex} className="black-move" reviews={reviews} />
          </div>
        ))}
      </div>
      <div className="difficulty-tag">
        Matthias · {difficultyLabel(difficulty)}
      </div>
    </aside>
  );
}
