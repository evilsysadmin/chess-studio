import { useEffect, useMemo, useState } from 'react';
import { fetchAdminUsers, updateAdminUserRating } from '../admin.js';
import './AdminRatingEditor.css';

function initialDrafts(users) {
  return Object.fromEntries((users || []).map((user) => [user.username, String(user.rating ?? 400)]));
}

export default function AdminRatingEditor() {
  const [users, setUsers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const sortedUsers = useMemo(() => [...users].sort((a, b) => String(a.username).localeCompare(String(b.username))), [users]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchAdminUsers()
      .then((rows) => {
        if (!mounted) return;
        const next = Array.isArray(rows) ? rows : [];
        setUsers(next);
        setDrafts(initialDrafts(next));
      })
      .catch((err) => { if (mounted) setError(err?.message || 'No se pudieron cargar los ELO.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  async function save(username) {
    const rating = Number(drafts[username]);
    if (!Number.isInteger(rating) || rating < 400 || rating > 3000) {
      setError('El ELO debe ser un entero entre 400 y 3000.');
      return;
    }
    setSaving(username);
    setError(null);
    setMessage(null);
    try {
      const result = await updateAdminUserRating(username, rating);
      setUsers((current) => current.map((user) => (
        user.username === username ? { ...user, rating: result.rating, ratingGames: result.games } : user
      )));
      setDrafts((current) => ({ ...current, [username]: String(result.rating) }));
      setMessage(`${username}: ELO ${result.previousRating ?? '—'} → ${result.rating}.`);
    } catch (err) {
      setError(err?.message || 'No se pudo corregir el ELO.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="admin-rating-editor" aria-labelledby="admin-rating-editor-title">
      <div className="admin-rating-editor-heading">
        <div>
          <span className="section-label">Calibración</span>
          <h2 id="admin-rating-editor-title">ELO de jugadores</h2>
          <p>Corrige el rating actual sin alterar partidas ni resultados. La dificultad automática usará el nuevo ELO en la próxima partida.</p>
        </div>
      </div>
      {loading ? <p className="admin-muted">Cargando ratings…</p> : (
        <div className="admin-rating-grid" role="list" aria-label="Ratings editables">
          {sortedUsers.map((user) => {
            const current = user.rating ?? 400;
            const draft = drafts[user.username] ?? String(current);
            const changed = Number(draft) !== Number(current);
            return (
              <div className="admin-rating-row" role="listitem" key={user.username}>
                <div className="admin-rating-identity">
                  <strong>{user.username}</strong>
                  <small>{user.ratingGames ?? 0} partidas ELO · actual {user.rating ?? 'sin calibrar'}</small>
                </div>
                <label>
                  <span>Nuevo ELO</span>
                  <input
                    type="number"
                    min="400"
                    max="3000"
                    step="1"
                    value={draft}
                    onChange={(event) => setDrafts((currentDrafts) => ({ ...currentDrafts, [user.username]: event.target.value }))}
                    aria-label={`Nuevo ELO para ${user.username}`}
                  />
                </label>
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={!changed || saving === user.username}
                  onClick={() => save(user.username)}
                >
                  {saving === user.username ? 'Guardando…' : 'Guardar ELO'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {message && <p className="admin-rating-success" role="status">{message}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </section>
  );
}
