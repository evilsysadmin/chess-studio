import { useMemo } from 'react';
import { combatArmyGlance } from '../combatArmyGlance.js';

export default function CampaignArmyGlance({ roster }) {
  const glance = useMemo(() => combatArmyGlance(roster), [roster]);
  return (
    <section className="campaign-army-glance" aria-label="Expediente resumido del ejército">
      <div className="campaign-army-glance-heading">
        <span>EXPEDIENTE DEL EJÉRCITO</span>
        <strong>{glance.standout ? `Veterano destacado · ${glance.standout.alias}` : 'Aún sin veterano destacado'}</strong>
      </div>
      <div className="campaign-army-glance-facts">
        <span><b>{glance.experienced}</b> con experiencia</span>
        <span><b>{glance.decorated}</b> condecorados</span>
        <span><b>{glance.memorial}</b> en Memorial</span>
      </div>
      {glance.standout && (
        <small>{glance.standout.battles} batallas · {glance.standout.survivals} supervivencias · {glance.standout.kills} bajas{glance.standout.bossVictories ? ` · ${glance.standout.bossVictories} boss` : ''}</small>
      )}
    </section>
  );
}
