import React, { useEffect, useState } from 'react';
import { forgotPassword, login, register, resetPassword, wakeBackend } from '../auth.js';

function authParamsFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      resetToken: params.get('resetToken') || '',
      inviteCode: params.get('invite') || params.get('inviteCode') || '',
    };
  } catch (_) {
    return { resetToken: '', inviteCode: '' };
  }
}

function clearAuthParamsFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('resetToken');
    url.searchParams.delete('invite');
    url.searchParams.delete('inviteCode');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch (_) {
    // No bloquea el login si un navegador raro no permite tocar history.
  }
}

export default function LoginScreen({ onLoggedIn }) {
  const initialAuthParams = authParamsFromUrl();
  const [mode, setMode] = useState(initialAuthParams.resetToken ? 'reset' : initialAuthParams.inviteCode ? 'register' : 'login');
  const [resetToken] = useState(initialAuthParams.resetToken);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(initialAuthParams.inviteCode);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    wakeBackend();
    // Los valores ya están capturados en estado. Los quitamos inmediatamente
    // de la barra y del historial para no arrastrar tokens/códigos al copiar
    // la URL, hacer capturas o navegar por la app.
    clearAuthParamsFromUrl();
  }, []);

  function changeMode(next) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setConfirmPassword('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (mode === 'register') {
        await register(username, password, email, inviteCode);
        onLoggedIn();
      } else if (mode === 'forgot') {
        const result = await forgotPassword(email);
        setNotice(result?.message || 'Si ese email está registrado, recibirás un enlace de recuperación.');
      } else if (mode === 'reset') {
        if (!resetToken) throw new Error('Falta el token de recuperación. Solicita un enlace nuevo.');
        if (password !== confirmPassword) throw new Error('Las contraseñas no coinciden.');
        await resetPassword(resetToken, password);
        onLoggedIn();
      } else {
        await login(username, password);
        onLoggedIn();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const title = mode === 'register'
    ? 'Crear cuenta'
    : mode === 'forgot'
      ? 'Recuperar contraseña'
      : mode === 'reset'
        ? 'Nueva contraseña'
        : 'Iniciar sesión';

  return (
    <div className="app-shell">
      <div className="menu" style={{ maxWidth: 420 }}>
        <div className="menu-section">
          <span className="eyebrow">Escuela de Ajedrez</span>
          <h2>{title}</h2>
          <p className="hint-text" style={{ marginBottom: '1rem' }}>
            {mode === 'register' && 'Cada cuenta tiene su propio progreso. El email se usa únicamente para recuperar el acceso.'}
            {mode === 'login' && 'Entra con tu usuario para seguir donde lo dejaste.'}
            {mode === 'forgot' && 'Te enviaremos un enlace temporal si el email pertenece a una cuenta.'}
            {mode === 'reset' && 'El enlace caduca a los 30 minutos y queda invalidado después de usarlo.'}
          </p>

          <form onSubmit={handleSubmit}>
            {(mode === 'login' || mode === 'register') && (
              <>
                <label className="field-label" htmlFor="login-username">Usuario</label>
                <input id="login-username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="text-input" autoComplete="username" minLength={3} required style={{ width: '100%', marginBottom: '0.7rem' }} />
              </>
            )}

            {(mode === 'register' || mode === 'forgot') && (
              <>
                <label className="field-label" htmlFor="login-email">Email</label>
                <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="text-input" autoComplete="email" required style={{ width: '100%', marginBottom: '0.7rem' }} />
              </>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <>
                <label className="field-label" htmlFor="login-password">{mode === 'reset' ? 'Nueva contraseña' : 'Contraseña'}</label>
                <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="text-input" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required style={{ width: '100%', marginBottom: '0.7rem' }} />
              </>
            )}

            {mode === 'reset' && (
              <>
                <label className="field-label" htmlFor="login-password-confirm">Repite la contraseña</label>
                <input id="login-password-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="text-input" autoComplete="new-password" minLength={6} required style={{ width: '100%', marginBottom: '0.7rem' }} />
              </>
            )}

            {mode === 'register' && (
              <>
                <label className="field-label" htmlFor="login-invite-code">Código de invitación</label>
                <input id="login-invite-code" type="password" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="text-input" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Sólo si el servidor lo exige" style={{ width: '100%', marginBottom: '0.7rem' }} />
              </>
            )}

            {error && <p className="error-text" style={{ marginBottom: '0.7rem' }}>{error}</p>}
            {notice && <p className="hint-text" style={{ marginBottom: '0.7rem' }}>{notice}</p>}

            <button type="submit" className="primary-btn" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Un momento…' : mode === 'register' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar enlace' : mode === 'reset' ? 'Cambiar contraseña' : 'Entrar'}
            </button>
          </form>

          {mode === 'login' && (
            <>
              <button type="button" className="backup-link" style={{ marginTop: '0.9rem' }} onClick={() => changeMode('forgot')}>
                He olvidado la contraseña
              </button>
              <button type="button" className="backup-link" style={{ marginTop: '0.45rem' }} onClick={() => changeMode('register')}>
                ¿No tienes cuenta? Créala
              </button>
            </>
          )}

          {(mode === 'register' || mode === 'forgot') && (
            <button type="button" className="backup-link" style={{ marginTop: '0.9rem' }} onClick={() => changeMode('login')}>
              Volver a iniciar sesión
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
