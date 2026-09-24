import { useEffect, useMemo, useState } from 'react';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { currentDailyStreak, dailyChallengeBrief } from '../dailyChallenge.js';
import { loadUserReleaseArchive, loadUserReleaseNotes } from '../userReleaseNotes.js';
import './UserReleaseNotesModal.css';

// Short, honest tips about controls the player can actually use today.
const TIPS = Object.freeze([
  'Pasa el ratón sobre las balizas de la sala para ver su nombre; púlsalas para entrar.',
  '«Accesos rápidos», arriba en el centro, te lleva a cualquier sitio sin buscar el objeto.',
  'Bajo JUGAR, «Más formas de jugar» abre el 1 contra 1 y la partida de práctica.',
  'Si no sabes por dónde empezar, abre Mazmorras: «Hoy te toca» te propone algo.',
]);

function formatNoteDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(date);
}

// «Novedades»: what you can do today (streak and the daily challenge), the few latest changes in
// plain language with a "Verlo" shortcut, a few tips, and the old changelog behind «Ver anteriores».
export default function UserReleaseNotesModal({ onClose, onAction = null }) {
  useEscapeToClose(onClose);
  const [notes, setNotes] = useState(null);
  const [failed, setFailed] = useState(false);
  const [archive, setArchive] = useState(null);
  const [archiveFailed, setArchiveFailed] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const daily = useMemo(() => dailyChallengeBrief(currentDailyStreak(new Date())), []);

  useEffect(() => {
    let active = true;
    loadUserReleaseNotes()
      .then((entries) => { if (active) setNotes(entries); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!archiveOpen || archive || archiveFailed) return undefined;
    let active = true;
    loadUserReleaseArchive()
      .then((entries) => { if (active) setArchive(entries); })
      .catch(() => { if (active) setArchiveFailed(true); });
    return () => { active = false; };
  }, [archiveOpen, archive, archiveFailed]);

  const run = (to) => {
    if (to && to !== 'close' && onAction) onAction(to);
    else onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="army-card release-notes-modal" role="dialog" aria-modal="true" aria-labelledby="release-notes-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar novedades">×</button>
        <span className="eyebrow">Novedades</span>
        <h2 id="release-notes-title">Qué hay para ti</h2>

        <section className="release-today" aria-label="Hoy">
          <span className="release-today__eyebrow">HOY</span>
          <strong>{daily.headline}</strong>
          <p>{daily.detail}</p>
          {!daily.full && onAction && (
            <button type="button" className="release-today__go" onClick={() => run('daily')}>Ir al reto de hoy ›</button>
          )}
        </section>

        <h3 className="release-heading">Lo último</h3>
        <div className="release-notes-list">
          {notes == null && !failed && <p className="hint-text" role="status">Abriendo las novedades…</p>}
          {failed && <p className="hint-text" role="status">No se pudieron cargar las novedades. Cierra y vuelve a intentarlo.</p>}
          {notes?.map((entry, index) => (
            <article key={entry.id} className="release-note">
              <header>
                <b>{entry.title}</b>
                <time dateTime={entry.date}>{formatNoteDate(entry.date)}</time>
              </header>
              <ul>{entry.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
              {entry.action && (
                <button type="button" className={`release-note__go${index === 0 ? ' is-primary' : ''}`} onClick={() => run(entry.action.to)}>
                  {entry.action.label} ›
                </button>
              )}
            </article>
          ))}
        </div>

        <h3 className="release-heading">Trucos</h3>
        <ul className="release-tips">
          {TIPS.map((tip) => <li key={tip}>{tip}</li>)}
        </ul>

        <details className="release-archive" onToggle={(event) => setArchiveOpen(event.currentTarget.open)}>
          <summary>Ver anteriores</summary>
          {archiveOpen && !archive && !archiveFailed && <p className="hint-text" role="status">Abriendo el archivo…</p>}
          {archiveFailed && <p className="hint-text" role="status">No se pudo abrir el archivo.</p>}
          {archive?.map((entry) => (
            <details key={entry.release} className="release-archive__entry">
              <summary><span>{entry.release}</span><b>{entry.title}</b></summary>
              <ul>{entry.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
            </details>
          ))}
        </details>
      </section>
    </div>
  );
}
