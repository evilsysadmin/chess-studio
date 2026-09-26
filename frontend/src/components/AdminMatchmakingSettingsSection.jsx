import { useEffect, useState } from 'react';
import { fetchAdminMatchmakingSettings, updateAdminMatchmakingSettings } from '../admin.js';
import { setRuntimeQuickMatchTargetLeadElo } from '../quickMatchDifficulty.js';

const LEAD_OPTIONS = [0, 25, 50, 75, 100, 125, 150];

export default function AdminMatchmakingSettingsSection() {
  const [lead, setLead] = useState(50);
  const [savedLead, setSavedLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    fetchAdminMatchmakingSettings()
      .then((payload) => {
        if (!active) return;
        const value = Number(payload?.targetLeadElo);
        const normalized = Number.isFinite(value) ? Math.max(0, Math.min(150, Math.round(value))) : 50;
        setLead(normalized);
        setSavedLead(normalized);
        setError(null);
      })
      .catch((requestError) => {
        if (active) setError(requestError?.message || 'No se pudo cargar el ajuste de matchmaking.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save() {
    if (saving || loading) return;
    setSaving(true);
    setError(null);
    try {
      const payload = await updateAdminMatchmakingSettings(lead);
      const value = Number(payload?.targetLeadElo);
      const normalized = Number.isFinite(value) ? Math.max(0, Math.min(150, Math.round(value))) : lead;
      setRuntimeQuickMatchTargetLeadElo(normalized);
      setLead(normalized);
      setSavedLead(normalized);
    } catch (requestError) {
      setError(requestError?.message || 'No se pudo guardar el ajuste de matchmaking.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-matthias-status" aria-label="Ajustes de matchmaking de Matthias">
      <div className="admin-matthias-status-heading">
        <div>
          <span className="section-label">Matthias · matchmaking</span>
          <h3>Ventaja Elo objetivo</h3>
        </div>
      </div>
      <p className="hint-text">
        Partida rápida automática busca un rival aproximadamente este número de puntos por encima del rating del jugador.
        La forma reciente puede aliviar o endurecer la siguiente partida; nunca cambia la fuerza durante una partida activa.
      </p>
      <div className="admin-matthias-preview-controls">
        <select
          value={lead}
          disabled={loading || saving}
          onChange={(event) => setLead(Number(event.target.value))}
          aria-label="Ventaja Elo objetivo de Matthias"
        >
          {LEAD_OPTIONS.map((value) => <option key={value} value={value}>+{value} Elo</option>)}
        </select>
        <button type="button" className="secondary-btn" disabled={loading || saving || lead === savedLead} onClick={() => void save()}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {savedLead != null && !error && <small>Valor activo: +{savedLead} Elo · se aplica a nuevas partidas automáticas.</small>}
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
