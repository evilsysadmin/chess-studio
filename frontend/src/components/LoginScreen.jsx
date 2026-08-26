import { useEffect, useState } from 'react';
import { forgotPassword, login, register, resetPassword, wakeBackend } from '../auth.js';
import { SUPPORTED_UI_LANGUAGES } from '../userPreferences.js';
import { connectionErrorCopy } from '../networkErrorCopy.js';

const COPY = {
  es: {
    login: 'Iniciar sesión', register: 'Crear cuenta', forgot: 'Recuperar contraseña', reset: 'Nueva contraseña',
    loginHint: 'Entra con tu usuario para seguir donde lo dejaste.', registerHint: 'Cada cuenta tiene su propio progreso. El email se usa únicamente para recuperar el acceso.',
    forgotHint: 'Te enviaremos un enlace temporal si el email pertenece a una cuenta.', resetHint: 'El enlace caduca a los 30 minutos y queda invalidado después de usarlo.',
    username: 'Usuario', email: 'Email', password: 'Contraseña', newPassword: 'Nueva contraseña', repeatPassword: 'Repite la contraseña', language: 'Idioma', invite: 'Código de invitación', invitePlaceholder: 'Sólo si el servidor lo exige',
    wait: 'Un momento…', create: 'Crear cuenta', send: 'Enviar enlace', change: 'Cambiar contraseña', enter: 'Entrar', forgotLink: 'He olvidado la contraseña', createLink: '¿No tienes cuenta? Créala', back: 'Volver a iniciar sesión', mismatch: 'Las contraseñas no coinciden.', missingToken: 'Falta el token de recuperación. Solicita un enlace nuevo.', recoveryNotice: 'Si ese email está registrado, recibirás un enlace de recuperación.',
  },
  en: {
    login: 'Sign in', register: 'Create account', forgot: 'Reset password', reset: 'New password',
    loginHint: 'Sign in to continue where you left off.', registerHint: 'Each account keeps its own progress. Your email is only used for account recovery.',
    forgotHint: 'We will send a temporary link if the email belongs to an account.', resetHint: 'The link expires after 30 minutes and can only be used once.',
    username: 'Username', email: 'Email', password: 'Password', newPassword: 'New password', repeatPassword: 'Repeat password', language: 'Language', invite: 'Invitation code', invitePlaceholder: 'Only if required by the server',
    wait: 'One moment…', create: 'Create account', send: 'Send link', change: 'Change password', enter: 'Sign in', forgotLink: 'I forgot my password', createLink: 'No account yet? Create one', back: 'Back to sign in', mismatch: 'Passwords do not match.', missingToken: 'The recovery token is missing. Request a new link.', recoveryNotice: 'If that email is registered, you will receive a recovery link.',
  },
};

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
  const [language, setLanguage] = useState('es');
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
        await register(username, password, email, inviteCode, language);
        onLoggedIn();
      } else if (mode === 'forgot') {
        const result = await forgotPassword(email);
        setNotice(result?.message || COPY[language].recoveryNotice);
      } else if (mode === 'reset') {
        if (!resetToken) throw new Error(COPY[language].missingToken);
        if (password !== confirmPassword) throw new Error(COPY[language].mismatch);
        await resetPassword(resetToken, password);
        onLoggedIn();
      } else {
        await login(username, password);
        onLoggedIn();
      }
    } catch (err) {
      setError(connectionErrorCopy(err, language));
    } finally {
      setLoading(false);
    }
  }

  const text = COPY[language];
  const title = mode === 'register'
    ? text.register
    : mode === 'forgot'
      ? text.forgot
      : mode === 'reset'
        ? text.reset
        : text.login;

  return (
    <div className="app-shell">
      <div className="menu" style={{ maxWidth: 420 }}>
        <div className="menu-section">
          <span className="eyebrow">Chess Studio</span>
          <h2>{title}</h2>
          <p className="hint-text" style={{ marginBottom: '1rem' }}>
            {mode === 'register' && text.registerHint}
            {mode === 'login' && text.loginHint}
            {mode === 'forgot' && text.forgotHint}
            {mode === 'reset' && text.resetHint}
          </p>

          <form onSubmit={handleSubmit} aria-busy={loading}>
            {(mode === 'login' || mode === 'register') && (
              <>
                <label className="field-label" htmlFor="login-username">{text.username}</label>
                <input id="login-username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="text-input" autoComplete="username" minLength={3} maxLength={64} required style={{ width: '100%', marginBottom: '0.7rem' }} />
              </>
            )}

            {(mode === 'register' || mode === 'forgot') && (
              <>
                <label className="field-label" htmlFor="login-email">{text.email}</label>
                <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="text-input" autoComplete="email" maxLength={254} required style={{ width: '100%', marginBottom: '0.7rem' }} />
              </>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <>
                <label className="field-label" htmlFor="login-password">{mode === 'reset' ? text.newPassword : text.password}</label>
                <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="text-input" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} maxLength={128} required style={{ width: '100%', marginBottom: '0.7rem' }} />
              </>
            )}

            {mode === 'reset' && (
              <>
                <label className="field-label" htmlFor="login-password-confirm">{text.repeatPassword}</label>
                <input id="login-password-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="text-input" autoComplete="new-password" minLength={6} maxLength={128} required style={{ width: '100%', marginBottom: '0.7rem' }} />
              </>
            )}

            {mode === 'register' && (
              <>
                <label className="field-label" htmlFor="register-language">{text.language}</label>
                <select id="register-language" className="text-input" value={language} onChange={(event) => setLanguage(event.target.value)} style={{ width: '100%', marginBottom: '0.7rem' }}>{SUPPORTED_UI_LANGUAGES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select>
                <label className="field-label" htmlFor="login-invite-code">{text.invite}</label>
                <input id="login-invite-code" type="password" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="text-input" autoComplete="off" maxLength={128} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={text.invitePlaceholder} style={{ width: '100%', marginBottom: '0.7rem' }} />
              </>
            )}

            {error && <p className="error-text" role="alert" style={{ marginBottom: '0.7rem' }}>{error}</p>}
            {notice && <p className="hint-text" role="status" style={{ marginBottom: '0.7rem' }}>{notice}</p>}

            <button type="submit" className="primary-btn" style={{ width: '100%' }} disabled={loading}>
              {loading ? text.wait : mode === 'register' ? text.create : mode === 'forgot' ? text.send : mode === 'reset' ? text.change : text.enter}
            </button>
          </form>

          {mode === 'login' && (
            <>
              <button type="button" className="backup-link" style={{ marginTop: '0.9rem' }} onClick={() => changeMode('forgot')}>
                {text.forgotLink}
              </button>
              <button type="button" className="backup-link" style={{ marginTop: '0.45rem' }} onClick={() => changeMode('register')}>
                {text.createLink}
              </button>
            </>
          )}

          {(mode === 'register' || mode === 'forgot') && (
            <button type="button" className="backup-link" style={{ marginTop: '0.9rem' }} onClick={() => changeMode('login')}>
              {text.back}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
