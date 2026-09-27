import { useEffect, useState } from 'react';
import { fetchAdminMatchmakingSettings, updateAdminMatchmakingSettings } from '../admin.js';
import { setMatchmakingTargetLeadElo } from '../matchmakingSettings.js';

export default function AdminMatchmakingSettingsSection() {
  const [value, setValue] = useState(50);
  const [saved, setSaved] = useState(50);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    fetchAdminMatchmakingSettings()
      .then((payload) => {
        if (!active) return;
        const target = Number(payload?.targetLeadElo ?? 50);
        setValue(target);
        setSaved(target);
        setStatus('idle');
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'No se pudo cargar el ajuste.');
        setStatus('error');
      });
    return () => { active = false; };
  }, []);

  async function save() {
    setStatus('saving');
    setError(null);
    try {
      const payload = await updateAdminMatchmakingSettings(value);
      const target = Number(payload?.targetLeadElo ?? value);
      setValue(target);
      setSaved(target);
      setMatchmakingTargetLeadElo(target);
      setStatus('saved');
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el ajuste.');
      setStatus('error');
    }
  }

  return (
    <section className="army-card admin-matchmaking-settings">
      <span className="section-label">Matchmaking</span>
      <h3>Ventaja objetivo de Matthias</h3>
      <p className="hint-text">ELO que Matthias intenta quedar por encima del jugador en partida rápida adaptativa. El sistema de forma y calidad sigue aplicando sus límites.</p>
      <div className="admin-setting-row">
        <label htmlFor="admin-matchmaking-target-lead">Ventaja ELO</label>
        <input
          id="admin-matchmaking-target-lead"
          type="number"
          min="0"
          max="150"
          step="5"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={status === 'loading' || status === 'saving'}
        />
        <button type="button" className="secondary-btn" onClick={() => void save()} disabled={status === 'loading' || status === 'saving' || Number(value) === Number(saved)}>
          {status === 'saving' ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {status === 'saved' && <small>Guardado: +{saved} ELO.</small>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
