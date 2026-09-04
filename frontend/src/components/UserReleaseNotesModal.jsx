import { useEffect, useState } from 'react';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { loadUserReleaseNotes } from '../userReleaseNotes.js';

export default function UserReleaseNotesModal({ onClose }) {
  useEscapeToClose(onClose);
  const [notes, setNotes] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadUserReleaseNotes()
      .then((entries) => {
        if (active) setNotes(entries);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="army-card release-notes-modal" role="dialog" aria-modal="true" aria-labelledby="release-notes-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar novedades">×</button>
        <span className="eyebrow">Novedades</span>
        <h2 id="release-notes-title">Qué ha cambiado para ti</h2>
        <p className="hint-text">Sólo mejoras que puedes ver o utilizar. Los cambios técnicos se quedan fuera.</p>
        <div className="release-notes-list">
          {notes == null && !failed && <p className="hint-text" role="status">Abriendo el archivo de novedades…</p>}
          {failed && <p className="hint-text" role="status">No se pudieron cargar las novedades. Cierra y vuelve a intentarlo.</p>}
          {notes?.map((entry, index) => (
            <details key={entry.release} open={index === 0}>
              <summary><span>{entry.release}</span><b>{entry.title}</b></summary>
              <ul>{entry.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
