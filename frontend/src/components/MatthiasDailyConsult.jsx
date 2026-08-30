import { useEffect, useMemo, useRef, useState } from 'react';
import { matthiasMoodAvatar } from '../matthiasVisuals.js';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import { askMatthiasDaily, createMatthiasConsultationId, fetchMatthiasDailyStatus } from '../matthiasDaily.js';
import { focusMatthiasDailyFacts } from '../matthiasDailyQuestions.js';
import { buildMatthiasDossierEntries, formatMatthiasDossierDate } from '../matthiasDossier.js';

const MOOD_LABELS = Object.freeze({
  observant: 'Observador',
  impressed: 'Impresionado',
  skeptical: 'Escéptico',
  satisfied: 'Satisfecho',
  pleased: 'Contento',
  annoyed: 'Cabreado',
});

const OPTIONS = Object.freeze([
  ['improve', '¿Qué debería mejorar ahora?'],
  ['tactics', 'Dame un consejo táctico'],
  ['strengths', '¿Qué estoy haciendo bien?'],
  ['action', 'Dame una acción concreta'],
  ['openings', '¿Qué apertura debería trabajar?'],
]);

export function isRealMatthiasDailyAnswer(result) {
  if (!result?.text || result?.provider !== 'cloudflare') return false;
  return Boolean(result.used || result.unlimited);
}

export default function MatthiasDailyConsult({ facts, isAdminUser = false }) {
  const eligible = Number(facts?.total_games || 0) > 0;
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const retryIdsRef = useRef(new Map());
  const optionList = useMemo(() => OPTIONS.filter(([kind]) => kind !== 'openings' || (facts?.openings?.length || facts?.favorite_opening)), [facts]);

  useEffect(() => {
    if (!eligible) return undefined;
    let active = true;
    void fetchMatthiasDailyStatus()
      .then((value) => { if (active) setStatus(value); })
      .catch(() => { if (active) setStatus({ used: false }); });
    return () => { active = false; };
  }, [eligible]);

  if (!eligible) return null;

  async function ask(kind) {
    if (loading || (!isAdminUser && (status?.used || status?.pending))) return;
    setLoading(true);
    setError(null);
    const consultationId = retryIdsRef.current.get(kind) || createMatthiasConsultationId();
    retryIdsRef.current.set(kind, consultationId);
    try {
      const focusedFacts = focusMatthiasDailyFacts(kind, facts);
      const result = await askMatthiasDaily(kind, focusedFacts, { id: consultationId });
      if (isRealMatthiasDailyAnswer(result)) {
        retryIdsRef.current.delete(kind);
        setStatus(result);
      } else {
        // A local fallback is retryable for every user, including admins. Admin
        // unlimited quota must not turn provider-failure copy into a fake
        // Matthias verdict merely because the fallback happened to contain text.
        setError(result?.text || 'Workers AI no respondió; la audiencia sigue disponible para reintentar hoy.');
      }
    } catch (err) {
      if (err?.status === 429 || err?.status === 409) {
        retryIdsRef.current.delete(kind);
        const refreshed = await fetchMatthiasDailyStatus().catch(() => ({ used: true }));
        setStatus(refreshed);
      } else {
        setError(err?.message || 'Matthias no está disponible ahora mismo.');
      }
    } finally {
      setLoading(false);
    }
  }

  const memory = status?.memory || null;
  const goals = Array.isArray(memory?.activeGoals) ? memory.activeGoals : [];
  const fame = Array.isArray(memory?.hallOfFame) ? memory.hallOfFame : [];
  const matthiasAvatar = matthiasMoodAvatar(memory?.mood || 'observant');
  const shame = Array.isArray(memory?.hallOfShame) ? memory.hallOfShame : [];
  const dossierEntries = buildMatthiasDossierEntries(memory);

  return (
    <section className="matthias-daily" aria-label="Consulta diaria con Matthias">
      <div className="matthias-daily-heading">
        <img src={matthiasAvatar} alt="" aria-hidden="true" />
        <div className="matthias-daily-title-copy"><span className="section-label matthias-daily-brandline"><img className="matthias-brand-mark" src={CPU_IDENTITY.brandMark} alt="" aria-hidden="true" />Matthias // consulta del día</span><h3>Una audiencia diaria. Elige bien, bitte.</h3></div>
      </div>
      {memory && (
        <details className="matthias-memory-card">
          <summary>Tu expediente con Matthias · {memory.relationship?.label || 'Recién llegado'}</summary>
          <div className="matthias-memory-grid">
            <div><span>Relación</span><b>{memory.relationship?.label || 'Recién llegado'}</b></div>
            <div><span>Respeto ganado</span><b>{memory.respect?.label || 'Recluta bajo observación'}</b></div>
            <div><span>Consultas</span><b>{memory.consultations || 0}</b></div>
            <div><span>Humor del despacho</span><b>{MOOD_LABELS[memory.mood] || 'Observador'}</b></div>
            <div><span>Apertura-némesis</span><b>{memory.nemesisOpening?.name || 'Sin patrón suficiente'}</b></div>
            <div><span>Rivalidad</span><b>{memory.rivalry?.games ? `${memory.rivalry.wins}-${memory.rivalry.losses}-${memory.rivalry.draws}` : 'Sin historial suficiente'}</b></div>
          </div>
          {memory.currentObsession?.label && <div className="matthias-memory-section is-obsession"><b>Obsesión actual de Matthias</b><p>{memory.currentObsession.label}</p></div>}
          {memory.activeChallenge?.label && <div className="matthias-memory-section is-challenge"><b>Reto pendiente</b><p>{memory.activeChallenge.label}{Number(memory.activeChallenge.setbacks || 0) > 0 ? ` · ${memory.activeChallenge.setbacks} reincidencia${memory.activeChallenge.setbacks === 1 ? '' : 's'} registrada${memory.activeChallenge.setbacks === 1 ? '' : 's'}` : ''}</p></div>}
          {goals.length > 0 && <div className="matthias-memory-section"><b>Objetivos activos</b><ul>{goals.map((goal) => <li key={goal.id}>{goal.label}</li>)}</ul></div>}
          {memory.adviceFollowup && <div className="matthias-memory-section"><b>Seguimiento del último consejo</b><p>{memory.adviceFollowup.status === 'waiting' ? `Faltan ${memory.adviceFollowup.games_needed || 0} partida(s) para juzgarlo con algo de fundamento.` : memory.adviceFollowup.status === 'improving' ? 'Los datos posteriores van en buena dirección. Matthias puede empezar a retirar la acusación.' : memory.adviceFollowup.status === 'struggling' ? 'Los datos posteriores siguen torcidos; el consejo continúa oficialmente abierto.' : 'Hay datos nuevos, pero todavía no dan un veredicto limpio.'}</p></div>}
          {memory.emblematicPositions?.length > 0 && <div className="matthias-memory-section"><b>Posiciones que Matthias no piensa olvidar</b><ul>{memory.emblematicPositions.slice(-3).map((item) => <li key={item.fingerprint}>{item.label}</li>)}</ul></div>}
          {dossierEntries.length > 0 && <div className="matthias-memory-section matthias-dossier-timeline"><b>Expediente reciente</b><ol>{dossierEntries.map((item) => {
            const date = formatMatthiasDossierDate(item.at);
            return <li key={item.id} className={`is-${item.polarity}`}><span aria-hidden="true">{item.polarity === 'shame' ? '▣' : '✦'}</span><p>{item.label}{date ? <small>{date}</small> : null}</p></li>;
          })}</ol></div>}
          {(fame.length > 0 || shame.length > 0) && <div className="matthias-memory-halls compact">
            <span>Archivo: <b>{fame.length}</b> méritos · <b>{shame.length}</b> agravios</span>
          </div>}
        </details>
      )}
      {status?.used ? (
        <div className="matthias-daily-answer">
          <p>{status.text}</p>
          <small>Audiencia agotada · Matthias volverá mañana.</small>
        </div>
      ) : status?.pending && !isAdminUser ? (
        <div className="matthias-daily-answer">
          <p>Matthias ya está atendiendo una consulta tuya en otra pestaña. Bitte, una audiencia a la vez.</p>
          <small>Cuando termine, vuelve a esta pantalla para ver el veredicto.</small>
        </div>
      ) : (
        <>
          {isAdminUser && status?.text ? <div className="matthias-daily-answer"><p>{status.text}</p><small>Admin · sin límite · la validación y el grounding siguen activos.</small></div> : null}
          <div className="matthias-daily-options">
            {optionList.map(([kind, label]) => <button key={kind} type="button" className="secondary-btn" disabled={loading || (!isAdminUser && status?.pending)} onClick={() => void ask(kind)}>{label}</button>)}
          </div>
          <small>{isAdminUser ? 'Admin · consultas ilimitadas. Chess Studio sigue validando cada pregunta y cada respuesta.' : 'Una consulta real por día. Chess Studio valida la pregunta, envía sólo hechos de tu juego y vuelve a validar la respuesta antes de enseñártela.'}</small>
          {Number(status?.memory?.consultations || 0) > 0 && <small>Matthias recuerda {status.memory.consultations} consulta{status.memory.consultations === 1 ? '' : 's'} anterior{status.memory.consultations === 1 ? '' : 'es'} para no empezar de cero cada día.</small>}
          {error && <p className="error-text" role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
