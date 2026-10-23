// Context for the secondary campaign states. Briefing/map have their own
// diegetic Operations Room surfaces; this is not a second source of truth.
export default function CampaignCommandStatus({ campaign, roster, fallenCount, onMarket, onRestart }) {
  const nextStep = campaign.phase === 'map'
    ? 'Elige uno de los sectores iluminados en el mapa.'
    : campaign.phase === 'briefing'
      ? 'Revisa qué cambia y prepara tu ejército.'
      : campaign.phase === 'reward'
        ? 'Elige una recompensa para seguir avanzando.'
        : campaign.phase === 'camp'
          ? 'Elige una ventaja y continúa.'
          : campaign.phase === 'event'
            ? 'Elige una respuesta al evento.'
            : campaign.phase === 'completed'
              ? 'Operación cumplida. Archiva la campaña.'
              : 'Continúa con la siguiente fase.';

  return (
    <>
      <div className="campaign-quick-status" aria-label="Resumen de campaña">
        <span>Sector <b>{Math.max(0, (campaign.route || []).length - 1)}/7</b></span>
        <span title="Recurso temporal de esta campaña"><b>{campaign.operationalCredits}</b> suministros</span>
        <span title="Fondos persistentes para mercado y bajas"><b>{roster.credits || 0}</b> créditos</span>
        {fallenCount > 0 && <span className="danger-text"><b>{fallenCount}</b> bajas</span>}
      </div>
      <div className="campaign-command-actions" aria-label="Acciones de campaña">
        <button type="button" className="secondary-btn campaign-market-primary" onClick={onMarket}>▣ Mercado</button>
        <button type="button" className="secondary-btn campaign-restart-action" onClick={onRestart}>↻ Reiniciar campaña</button>
      </div>
      <div className={`campaign-situation-banner campaign-friendly-next ${fallenCount ? 'danger' : ''}`}>
        <span>QUÉ HACER AHORA</span>
        <strong>{nextStep}</strong>
      </div>
    </>
  );
}
