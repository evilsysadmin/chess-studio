import { useEffect, useMemo, useState } from 'react';
import { fetchMatthiasDailyStatus } from '../matthiasDaily.js';
import { MATTHIAS_MEMORY_UPDATED_EVENT } from '../matthiasMemoryEvents.js';
import { buildMatthiasPersonalCampaign } from '../matthiasPersonalCampaign.js';

function chapterActionLabel(chapter) {
  return chapter?.actionLabel || null;
}

export default function InsightsMatthiasCampaign({
  gameHistory = [],
  onOpenPuzzles,
  onPlayFromHere,
}) {
  const [memory, setMemory] = useState(null);

  useEffect(() => {
    if (!gameHistory.length) return undefined;
    let active = true;
    let requestSeq = 0;

    const refreshMemory = ({ force = false } = {}) => {
      const seq = ++requestSeq;
      void fetchMatthiasDailyStatus({ force })
        .then((status) => { if (active && seq === requestSeq) setMemory(status?.memory || null); })
        .catch(() => { if (active && seq === requestSeq) setMemory(null); });
    };
    const onMemoryUpdated = (event) => {
      if (!active) return;
      requestSeq += 1;
      setMemory(event?.detail || null);
    };
    const refreshOnFocus = () => refreshMemory({ force: true });
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') refreshMemory({ force: true });
    };

    refreshMemory();
    window.addEventListener(MATTHIAS_MEMORY_UPDATED_EVENT, onMemoryUpdated);
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);
    return () => {
      active = false;
      requestSeq += 1;
      window.removeEventListener(MATTHIAS_MEMORY_UPDATED_EVENT, onMemoryUpdated);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [gameHistory.length]);

  const campaign = useMemo(
    () => buildMatthiasPersonalCampaign(memory, { history: gameHistory }),
    [memory, gameHistory],
  );

  if (!campaign) return null;

  function runChapter(chapter) {
    if (!chapter?.action) return;
    if (chapter.action === 'personal-filter') {
      onOpenPuzzles?.('personal', false, chapter.filter || null);
      return;
    }
    if (chapter.action === 'nemesis-position' && chapter.training?.fen) {
      onPlayFromHere?.(
        chapter.training.fen,
        chapter.training.humanColor,
        chapter.training.difficulty,
        {
          nemesis: true,
          nemesisLabel: `Campaña Matthias · ${chapter.opening}`,
          nemesisOpening: chapter.opening,
          sourceRecord: chapter.training.sourceRecordId ? { id: chapter.training.sourceRecordId } : undefined,
        },
      );
    }
  }

  const current = campaign.current;
  return (
    <section className="menu-section insights-matthias-campaign" aria-labelledby="matthias-campaign-title">
      <div className="insights-recurring-errors-heading">
        <div>
          <span className="section-label">Expediente por capítulos</span>
          <h2 id="matthias-campaign-title">Campaña personal de Matthias</h2>
          <p className="hint-text">No es un battle pass. Cada capítulo existe porque hay un reto, objetivo, Némesis o cierre realmente registrado en tu expediente.</p>
        </div>
        {campaign.respect ? <strong>{campaign.respect}</strong> : null}
      </div>

      {current ? (
        <article className="insights-recurring-error-card" data-matthias-campaign-current={current.kind}>
          <div className="insights-recurring-error-topline">
            <div><small>{current.eyebrow}</small><strong>{current.title}</strong></div>
            {current.progressLabel ? <span>{current.progressLabel}</span> : null}
          </div>
          <p>{current.detail}</p>
          <div className="insights-recurring-error-footer">
            <small>Este es el capítulo activo. Los siguientes no sustituyen al actual hasta que los datos permitan cerrarlo.</small>
            {current.action && chapterActionLabel(current) ? (
              <button type="button" className="primary-btn" onClick={() => runChapter(current)}>{chapterActionLabel(current)}</button>
            ) : null}
          </div>
        </article>
      ) : (
        <div className="coaching-action">
          <strong>Campaña al día.</strong>
          <span>Los últimos capítulos medidos están cerrados. Matthias abrirá otro cuando aparezca evidencia nueva suficiente.</span>
        </div>
      )}

      {(campaign.queue.length > 0 || campaign.completed.length > 0) ? (
        <details className="friendly-disclosure">
          <summary>Ver capítulos de la campaña</summary>
          <div className="friendly-disclosure-body">
            {campaign.queue.length > 0 ? (
              <div>
                <b>En cola</b>
                <ol>
                  {campaign.queue.map((chapter) => (
                    <li key={chapter.id}><strong>{chapter.title}</strong>{chapter.progressLabel ? ` · ${chapter.progressLabel}` : ''}<br /><small>{chapter.detail}</small></li>
                  ))}
                </ol>
              </div>
            ) : null}
            {campaign.completed.length > 0 ? (
              <div>
                <b>Capítulos cerrados con evidencia</b>
                <ol>
                  {campaign.completed.map((chapter) => <li key={chapter.id}>✓ {chapter.title}</li>)}
                </ol>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}
