import React, { useEffect, useState } from 'react';
import { fetchAdminUsers, fetchAdminUserDetail, editAdminUser, deleteAdminUser } from '../admin.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function AdminScreen({ onExit }) {
  useEscapeToClose(onExit);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null); // username expandido, o null
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editForm, setEditForm] = useState(null); // { rating, tournamentPoints, tournamentWins } en edición
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(null); // username, o null

  function loadUsers() {
    fetchAdminUsers()
      .then(setUsers)
      .catch((e) => setError(e.message));
  }

  useEffect(() => { loadUsers(); }, []);

  function toggleExpand(username) {
    if (expanded === username) {
      setExpanded(null);
      setDetail(null);
      setEditForm(null);
      return;
    }
    setExpanded(username);
    setDetail(null);
    setEditForm(null);
    setDetailLoading(true);
    fetchAdminUserDetail(username)
      .then((d) => {
        setDetail(d);
        setEditForm({ rating: d.rating ?? '', tournamentPoints: d.tournamentPoints ?? '', tournamentWins: d.tournamentWins ?? '' });
      })
      .catch((e) => setError(e.message))
      .finally(() => setDetailLoading(false));
  }

  async function handleSaveEdit(username) {
    setSaving(true);
    setError(null);
    try {
      const changes = {};
      if (editForm.rating !== '') changes.rating = Number(editForm.rating);
      if (editForm.tournamentPoints !== '') changes.tournamentPoints = Number(editForm.tournamentPoints);
      if (editForm.tournamentWins !== '') changes.tournamentWins = Number(editForm.tournamentWins);
      const updated = await editAdminUser(username, changes);
      setDetail(updated);
      loadUsers(); // refresca la lista para que la fila también muestre los valores nuevos
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete(username) {
    setError(null);
    try {
      await deleteAdminUser(username);
      setConfirmingDelete(null);
      setExpanded(null);
      loadUsers();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="menu">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section">
        <span className="section-label">Admin</span>
        <h2>Usuarios registrados</h2>

        {error && <p className="error-text">{error}</p>}
        {!error && !users && <p className="hint-text">Cargando…</p>}
        {!error && users && users.length === 0 && (
          <p className="hint-text">Todavía no hay ningún usuario registrado.</p>
        )}

        {!error && users && users.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Registrado</th>
                  <th>Rating</th>
                  <th>Puntos torneo</th>
                  <th>Victorias torneo</th>
                  <th>Partidas jugadas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <React.Fragment key={u.username}>
                    <tr>
                      <td>{u.username}</td>
                      <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                      <td>{u.rating ?? '—'}</td>
                      <td>{u.tournamentPoints ?? '—'}</td>
                      <td>{u.tournamentWins ?? '—'}</td>
                      <td>{u.gamesPlayed ?? '—'}</td>
                      <td>
                        <button type="button" className="backup-link" style={{ margin: 0 }} onClick={() => toggleExpand(u.username)}>
                          {expanded === u.username ? 'Cerrar' : 'Ver detalle'}
                        </button>
                      </td>
                    </tr>
                    {expanded === u.username && (
                      <tr>
                        <td colSpan={7}>
                          {detailLoading && <p className="hint-text">Cargando detalle…</p>}
                          {!detailLoading && detail && editForm && (
                            <div className="menu-section" style={{ margin: '0.5rem 0' }}>
                              <p className="hint-text">
                                Racha de victorias: <b>{detail.winStreak ?? '—'}</b> · mejor racha:{' '}
                                <b>{detail.bestWinStreak ?? '—'}</b> · logros desbloqueados:{' '}
                                <b>{detail.achievementsCount ?? '—'}</b> · puzzles resueltos:{' '}
                                <b>{detail.puzzlesSolved ?? '—'}</b>
                              </p>

                              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                                <label className="field-label" style={{ flex: '1 1 120px' }}>
                                  Rating
                                  <input
                                    type="number"
                                    className="text-input"
                                    value={editForm.rating}
                                    onChange={(e) => setEditForm({ ...editForm, rating: e.target.value })}
                                  />
                                </label>
                                <label className="field-label" style={{ flex: '1 1 120px' }}>
                                  Puntos de torneo
                                  <input
                                    type="number"
                                    className="text-input"
                                    value={editForm.tournamentPoints}
                                    onChange={(e) => setEditForm({ ...editForm, tournamentPoints: e.target.value })}
                                  />
                                </label>
                                <label className="field-label" style={{ flex: '1 1 120px' }}>
                                  Victorias de torneo
                                  <input
                                    type="number"
                                    className="text-input"
                                    value={editForm.tournamentWins}
                                    onChange={(e) => setEditForm({ ...editForm, tournamentWins: e.target.value })}
                                  />
                                </label>
                              </div>

                              <div className="game-controls" style={{ marginTop: '0.8rem' }}>
                                <button
                                  type="button"
                                  className="primary-btn"
                                  disabled={saving}
                                  onClick={() => handleSaveEdit(u.username)}
                                >
                                  {saving ? 'Guardando…' : 'Guardar cambios'}
                                </button>

                                {confirmingDelete === u.username ? (
                                  <>
                                    <button type="button" className="danger-btn" onClick={() => handleConfirmDelete(u.username)}>
                                      Sí, borrar la cuenta — no hay vuelta atrás
                                    </button>
                                    <button type="button" className="secondary-btn" onClick={() => setConfirmingDelete(null)}>
                                      No, dejarlo
                                    </button>
                                  </>
                                ) : (
                                  <button type="button" className="danger-btn" onClick={() => setConfirmingDelete(u.username)}>
                                    Borrar cuenta
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
