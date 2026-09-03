import React from 'react';
import { CPU_IDENTITY } from '../cpuIdentity.js';

const MATTHIAS_MOOD_LABELS = Object.freeze({
  observant: 'Observador',
  impressed: 'Impresionado',
  skeptical: 'Escéptico',
  satisfied: 'Satisfecho',
  pleased: 'Contento',
  annoyed: 'Cabreado',
});

export { MATTHIAS_MOOD_LABELS };

export default function AdminMatthiasStatusSection({
  status,
  error,
  previewPreset,
  preview,
  previewLoading,
  previewError,
  onPreviewPresetChange,
  onPreview,
}) {
  return (
    <section className="admin-matthias-status" aria-label="Estado de Matthias">
      <div className="admin-matthias-status-heading">
        <img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
        <div><span className="section-label">Matthias · memoria persistente</span><h3>Estado del entrenador residente</h3></div>
      </div>
      {error && <p className="error-text">{error}</p>}
      {!error && !status && <p className="hint-text">Leyendo la memoria de Matthias…</p>}
      {status && (
        <>
          <div className="admin-matthias-status-grid">
            <div><strong>{status.consultations ?? 0}</strong><span>consultas útiles recordadas</span></div>
            <div><strong>{status.usersWithMemory ?? 0}</strong><span>jugadores con memoria</span></div>
            <div><strong>{status.aiToday?.calls ?? 0}{status.aiToday?.boundedWindow ? '+' : ''}</strong><span>llamadas hoy</span></div>
            <div><strong>{status.storage === 'mongo' ? 'MongoDB' : 'Memoria local'}</strong><span>almacenamiento activo</span></div>
            <div><strong>{status.aiToday?.cloudflarePercent == null ? '—' : `${status.aiToday.cloudflarePercent}%`}</strong><span>Workers AI hoy</span></div>
            <div><strong>{status.aiToday?.fallbackPercent == null ? '—' : `${status.aiToday.fallbackPercent}%`}</strong><span>fallback local hoy</span></div>
            <div><strong>{status.aiToday?.p50Ms == null ? '—' : `${Math.round(status.aiToday.p50Ms)} ms`}</strong><span>latencia p50 Workers</span></div>
            <div><strong>{status.aiToday?.timeouts ?? 0}</strong><span>timeouts hoy</span></div>
            <div><strong>{status.milestonesRemembered ?? 0}</strong><span>hitos persistentes</span></div>
            <div><strong>{status.activeChallenges ?? 0}</strong><span>retos personales activos</span></div>
            <div><strong>{status.emblematicPositions ?? 0}</strong><span>posiciones emblemáticas</span></div>
            <div><strong>{status.topActiveGoal?.label || '—'}</strong><span>obsesión activa más común</span></div>
          </div>
          <div className="admin-matthias-advice">
            <span className="section-label">Telemetría de personalidad · agregada</span>
            <p><b>Humor actual:</b> {Object.entries(status.moodCounts || {}).length ? Object.entries(status.moodCounts || {}).map(([mood, count]) => `${MATTHIAS_MOOD_LABELS[mood] || mood}: ${count}`).join(' · ') : 'sin señal todavía'}</p>
            <p><b>Consultas por tipo:</b> {Object.entries(status.questionCounts || {}).length ? Object.entries(status.questionCounts || {}).sort((a, b) => b[1] - a[1]).map(([kind, count]) => `${kind}: ${count}`).join(' · ') : 'ninguna todavía'}</p>
            <small>No guarda prompts ni respuestas completas en esta telemetría: sólo contadores y estado derivado de rendimiento real.</small>
          </div>
          <div className="admin-matthias-advice">
            <span className="section-label">Consejo dominante · agregado y anónimo</span>
            {status.dominantAdvice?.label ? (
              <>
                <p>{status.dominantAdvice.label}</p>
                <small>{status.dominantAdvice.consultations ?? 0} consultas · {status.dominantAdvice.usersAffected ?? 0} jugador{status.dominantAdvice.usersAffected === 1 ? '' : 'es'} afectado{status.dominantAdvice.usersAffected === 1 ? '' : 's'}</small>
              </>
            ) : <p className="hint-text">Todavía no hay señal suficiente para un consejo dominante.</p>}
          </div>
          <div className="admin-matthias-preview">
            <div><span className="section-label">Banco de personalidad · datos sintéticos</span><p>Prueba cómo habla Matthias sin tocar memoria, estadísticas ni cuota de ningún jugador.</p></div>
            <div className="admin-matthias-preview-controls">
              <select value={previewPreset} onChange={(event) => onPreviewPresetChange(event.target.value)} aria-label="Perfil sintético de Matthias">
                <option value="newcomer">Recluta nuevo</option>
                <option value="veteran">Veterano respetado</option>
                <option value="repeat_offender">Reincidente táctico</option>
                <option value="improving">Jugador mejorando</option>
              </select>
              <button type="button" className="secondary-btn" disabled={previewLoading} onClick={onPreview}>{previewLoading ? 'Interrogando…' : 'Probar a Matthias'}</button>
            </div>
            {preview?.text && <div className="admin-matthias-preview-answer"><img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" /><p>{preview.text}</p><small>{preview.provider === 'cloudflare' ? 'Workers AI' : 'Fallback local'} · sandbox sintético</small></div>}
            {previewError && <p className="error-text">{previewError}</p>}
          </div>
          <small className="admin-matthias-privacy">Memoria schema v{status.memorySchemaVersion ?? '—'} · hasta {status.recentAdviceCap ?? '—'} consejos, {status.activeGoalCap ?? '—'} objetivos, {status.milestoneCap ?? '—'} hitos, {status.openingMemoryCap ?? '—'} aperturas y {status.emblematicPositionCap ?? '—'} posiciones emblemáticas por jugador. El panel agrega temas: no expone conversaciones privadas ni convierte consejos del LLM en hechos del jugador.</small>
        </>
      )}
    </section>
  );
}
