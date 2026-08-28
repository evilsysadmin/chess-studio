import { useEffect, useMemo, useState } from 'react';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import { askMatthiasDaily, fetchMatthiasDailyStatus } from '../matthiasDaily.js';

const OPTIONS = Object.freeze([
  ['improve', '¿Qué debería mejorar ahora?'],
  ['tactics', 'Dame un consejo táctico'],
  ['strengths', '¿Qué estoy haciendo bien?'],
  ['action', 'Dame una acción concreta'],
  ['openings', '¿Qué apertura debería trabajar?'],
]);

export default function MatthiasDailyConsult({ facts, isAdminUser = false }) {
  const eligible = Number(facts?.total_games || 0) > 0;
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
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
    try {
      const result = await askMatthiasDaily(kind, facts);
      if (result?.used || (result?.unlimited && result?.text)) setStatus(result);
      else setError(result?.text || 'Workers AI no respondió; la audiencia sigue disponible para reintentar hoy.');
    } catch (err) {
      if (err?.status === 429 || err?.status === 409) {
        const refreshed = await fetchMatthiasDailyStatus().catch(() => ({ used: true }));
        setStatus(refreshed);
      } else {
        setError(err?.message || 'Matthias no está disponible ahora mismo.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="matthias-daily" aria-label="Consulta diaria con Matthias">
      <div className="matthias-daily-heading">
        <img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
        <div><span className="section-label">Matthias // consulta del día</span><h3>Una audiencia diaria. Elige bien, bitte.</h3></div>
      </div>
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
          {error && <p className="error-text" role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
