import React, { useState, useEffect } from 'react';
import { register, login, wakeBackend } from '../auth.js';
import MuteToggle from './MuteToggle.jsx';

export default function LoginScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Apenas se muestra la pantalla de login, no cuando se manda el
  // formulario — así el backend ya está despierto para cuando el
  // usuario termina de escribir sus credenciales.
  useEffect(() => {
    wakeBackend();

    // Un link tipo "tu-app.com/?invite=XYZ" precarga el código y salta
    // directo al modo de registro — así el link que se comparte con
    // conocidos hace lo que promete, no hace falta que además adivinen
    // que tienen que cambiar de pestaña a "Crear cuenta" a mano.
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    if (invite) {
      setInviteCode(invite);
      setMode('register');
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'register') await register(username, password, inviteCode);
      else await login(username, password);
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
        <MuteToggle />
      </div>
      <div className="menu" style={{ maxWidth: 420 }}>
        <div className="menu-section">
          <span className="eyebrow">Escuela de Ajedrez</span>
          <h2>{mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
          <p className="hint-text" style={{ marginBottom: '1rem' }}>
            {mode === 'register'
              ? 'Cada cuenta tiene su propio progreso — torneo, rating, logros, todo separado.'
              : 'Entra con tu usuario para seguir donde lo dejaste.'}
          </p>

          <form onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="login-username">Usuario</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="text-input"
              autoComplete="username"
              minLength={3}
              required
              style={{ width: '100%', marginBottom: '0.7rem' }}
            />

            <label className="field-label" htmlFor="login-password">Contraseña</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-input"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={6}
              required
              style={{ width: '100%', marginBottom: '0.7rem' }}
            />

            {mode === 'register' && (
              <>
                <label className="field-label" htmlFor="login-invite">Código de invitación</label>
                <input
                  id="login-invite"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="text-input"
                  style={{ width: '100%', marginBottom: '0.7rem' }}
                />
              </>
            )}

            {error && <p className="error-text" style={{ marginBottom: '0.7rem' }}>{error}</p>}

            <button type="submit" className="primary-btn" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Un momento…' : mode === 'register' ? 'Crear cuenta' : 'Entrar'}
            </button>
          </form>

          <button
            type="button"
            className="backup-link"
            style={{ marginTop: '0.9rem' }}
            onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(null); }}
          >
            {mode === 'register' ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Créala'}
          </button>
        </div>
      </div>
    </div>
  );
}
