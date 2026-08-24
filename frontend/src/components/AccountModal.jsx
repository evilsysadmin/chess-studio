import { useEffect, useState } from 'react';
import { fetchMe, updateRecoveryEmail } from '../auth.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function AccountModal({ onClose }) {
  useEscapeToClose(onClose);
  const [me, setMe] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let live = true;
    fetchMe().then((value) => {
      if (!live) return;
      setMe(value);
      setEmail(value?.email || '');
    }).catch(() => {
      if (live) setError('No se pudo cargar la cuenta.');
    });
    return () => { live = false; };
  }, []);

  async function saveEmail(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateRecoveryEmail(email, password);
      setMe((current) => ({ ...current, email: updated.email }));
      setEmail(updated.email);
      setPassword('');
      setEditingEmail(false);
      setNotice('Email de recuperación actualizado.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card" role="dialog" aria-modal="true" aria-label="Mi cuenta" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">Cuenta</span>
        <h3>Mi cuenta</h3>
        {error && <p className="error-text">{error}</p>}
        {notice && <p className="hint-text">{notice}</p>}
        {!error && !me && <p className="hint-text">Cargando…</p>}
        {me && (
          <>
            <div className="admin-detail-grid">
              <div><span>Usuario</span><strong>{me.username}</strong></div>
              <div><span>Rol</span><strong>{me.isAdmin ? 'Administrador' : 'Jugador'}</strong></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span>Email de recuperación</span>
                <strong>{me.email || 'No configurado'}</strong>
              </div>
            </div>

            {!editingEmail ? (
              <button type="button" className="secondary-btn" style={{ width: '100%', marginTop: '1rem' }} onClick={() => {
                setEditingEmail(true);
                setError(null);
                setNotice(null);
              }}>
                {me.email ? 'Cambiar email de recuperación' : 'Añadir email de recuperación'}
              </button>
            ) : (
              <form onSubmit={saveEmail} style={{ marginTop: '1rem' }}>
                <label className="field-label" htmlFor="account-email">Nuevo email</label>
                <input id="account-email" type="email" className="text-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required style={{ width: '100%', marginBottom: '0.7rem' }} />

                <label className="field-label" htmlFor="account-password">Contraseña actual</label>
                <input id="account-password" type="password" className="text-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" minLength={6} maxLength={128} required style={{ width: '100%', marginBottom: '0.7rem' }} />

                <p className="hint-text" style={{ marginBottom: '0.8rem' }}>
                  Pedimos tu contraseña para que una sesión abierta en un equipo ajeno no pueda secuestrar el correo de recuperación.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <button type="button" className="secondary-btn" onClick={() => {
                    setEditingEmail(false);
                    setEmail(me.email || '');
                    setPassword('');
                    setError(null);
                  }}>Cancelar</button>
                  <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
