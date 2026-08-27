import { useEffect, useState } from 'react';
import { fetchMe, updateRecoveryEmail } from '../auth.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { getUiLanguage, setUiLanguage, SUPPORTED_UI_LANGUAGES } from '../userPreferences.js';
import ProfileBackupModal from './ProfileBackupModal.jsx';
import AchievementsModal from './AchievementsModal.jsx';
import { canInstallChessStudio, promptChessStudioInstall, PWA_INSTALL_AVAILABLE_EVENT } from '../pwaInstall.js';
import { levelForPoints } from '../tournament.js';
import { ratingLabel } from '../playerRating.js';

export default function AccountModal({ onClose, onLogout, loggingOut = false, rating = null, tournament = null, combatOverview = null }) {
  useEscapeToClose(onClose);
  const [me, setMe] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [language, setLanguage] = useState(() => getUiLanguage());
  const [showBackup, setShowBackup] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [canInstall, setCanInstall] = useState(() => canInstallChessStudio());

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

  useEffect(() => {
    const refresh = () => setCanInstall(canInstallChessStudio());
    window.addEventListener(PWA_INSTALL_AVAILABLE_EVENT, refresh);
    return () => window.removeEventListener(PWA_INSTALL_AVAILABLE_EVENT, refresh);
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

  function changeLanguage(event) {
    const next = setUiLanguage(event.target.value);
    setLanguage(next);
    setNotice(next === 'en'
      ? 'English saved. Sign-in is already translated; the rest of the studio will follow progressively.'
      : 'Idioma guardado.');
  }

  return (
    <>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card account-center" role="dialog" aria-modal="true" aria-label="Mi cuenta" onClick={(e) => e.stopPropagation()}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">Cuenta</span>
        <h3>Mi cuenta</h3>
        {error && <p className="error-text">{error}</p>}
        {notice && <p className="hint-text">{notice}</p>}
        {!error && !me && <div className="ui-state ui-state-loading" role="status"><b>Cargando tu cuenta</b><span>Recuperando la información del perfil…</span></div>}
        {me && (
          <>
            <div className="account-center-identity">
              <span className="account-center-avatar" aria-hidden="true">{(me.username || 'J').slice(0, 1).toUpperCase()}</span>
              <div><strong>{me.username}</strong><small>{me.isAdmin ? 'Administrador' : 'Jugador'} · progreso sincronizado</small></div>
            </div>

            <section className="account-progress-glance" aria-label="Tu avance">
              <div><span>Rating</span><b>{rating?.rating ?? '—'}</b><small>{rating ? ratingLabel(rating.rating) : 'Sin calibrar'}</small></div>
              <div><span>Torneo</span><b>Nivel {levelForPoints(tournament?.progressPoints || 0)}</b><small>Progreso competitivo</small></div>
              <div><span>Combat</span><b>{combatOverview?.rank?.label || 'Recluta'}</b><small>{combatOverview?.credits || 0} créditos</small></div>
              <div><span>Aprendizaje</span><b>Diagnóstico</b><small>Prioridad accionable</small></div>
            </section>

            <section className="account-center-section" aria-labelledby="account-language-heading">
              <div><strong id="account-language-heading">Idioma</strong><small>Se recuerda en este perfil.</small></div>
              <select value={language} onChange={changeLanguage} aria-label="Idioma de la interfaz">
                {SUPPORTED_UI_LANGUAGES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
            </section>

            <section className="account-center-section account-center-recovery" aria-labelledby="account-recovery-heading">
              <div>
                <strong id="account-recovery-heading">Recuperación</strong>
                <small>{me.email || 'Añade un email por si pierdes el acceso.'}</small>
                {me.emailRecoveryEnabled === false && <small>El email puede guardarse ahora; el envío de enlaces aún no está activo en este servidor.</small>}
              </div>

            {!editingEmail ? (
              <button type="button" className="secondary-btn" onClick={() => {
                setEditingEmail(true);
                setError(null);
                setNotice(null);
              }}>
                {me.email ? 'Cambiar email de recuperación' : 'Añadir email de recuperación'}
              </button>
            ) : (
              <form className="account-recovery-form" onSubmit={saveEmail}>
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
            </section>

            <section className="account-center-tools" aria-label="Perfil y progreso">
              <button type="button" onClick={() => setShowAchievements(true)}><b>Distintivos</b><small>Logros y títulos</small></button>
              <button type="button" onClick={() => setShowBackup(true)}><b>Gestionar progreso</b><small>Sincronización y copia</small></button>
              {canInstall && <button type="button" onClick={async () => { const installed = await promptChessStudioInstall(); setCanInstall(canInstallChessStudio()); if (installed) setNotice('Chess Studio instalado en este dispositivo.'); }}><b>Instalar aplicación</b><small>Acceso directo y pantalla completa</small></button>}
            </section>

            <details className="friendly-disclosure account-privacy-disclosure">
              <summary>Privacidad y datos</summary>
              <div className="friendly-disclosure-body">
                <p>Sincronizamos tu progreso, preferencias e historial para recuperarlos en otros dispositivos. Los datos técnicos de conexión se usan para seguridad y operación del servicio; no forman parte de tu perfil público.</p>
                <button type="button" className="secondary-btn" onClick={() => setShowBackup(true)}>Exportar o borrar mi progreso</button>
              </div>
            </details>

            {onLogout && (
              <div className="account-center-session">
                <div><strong>Sesión</strong><small>Guardaremos el progreso antes de salir.</small></div>
                <button type="button" className="destructive-btn" onClick={onLogout} disabled={loggingOut}>{loggingOut ? 'Guardando…' : 'Cerrar sesión'}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    {showAchievements && <AchievementsModal onClose={() => setShowAchievements(false)} />}
    {showBackup && <ProfileBackupModal onClose={() => setShowBackup(false)} />}
    </>
  );
}
