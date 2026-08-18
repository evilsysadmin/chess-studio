import React, { useEffect, useState } from 'react';
import { fetchAdminUsers } from '../admin.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function AdminScreen({ onExit }) {
  useEscapeToClose(onExit);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAdminUsers()
      .then(setUsers)
      .catch((e) => setError(e.message));
  }, []);

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
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.username}>
                    <td>{u.username}</td>
                    <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                    <td>{u.rating ?? '—'}</td>
                    <td>{u.tournamentPoints ?? '—'}</td>
                    <td>{u.tournamentWins ?? '—'}</td>
                    <td>{u.gamesPlayed ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
