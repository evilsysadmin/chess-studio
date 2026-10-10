import { createPortal } from 'react-dom';
import {
  CHRONICLES_GOLD_ITEM_ID,
  chroniclesGoldBalance,
  chroniclesInventoryEntries,
} from '../chronicles/chroniclesContentRuntime.js';
import {
  CHRONICLES_ATTRIBUTE_CAP,
  CHRONICLES_ATTRIBUTE_DEFINITIONS,
  chroniclesAllowedAttributes,
  chroniclesHeroProgress,
  chroniclesSkillsForMember,
  chroniclesXpThresholdForLevel,
  chroniclesXpToNextLevel,
} from '../chroniclesOfMatthiasProgression.js';
import { chroniclesPartyRelic } from '../chroniclesOfMatthiasRelics.js';
import {
  CHRONICLES_EQUIPMENT,
  CHRONICLES_EQUIPMENT_SLOTS,
  chroniclesEquippedItem,
  chroniclesEquipmentBonuses,
} from '../chronicles/chroniclesEquipment.js';
import { chroniclesPartyAttackStats } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsEffectiveProfile } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesPartyPortraitUrl } from '../chronicles/chroniclesPartyPortraitAssets.js';

const RELIC_LABELS = Object.freeze({
  'spectral-lantern': Object.freeze({
    name: 'Farol espectral',
    description: 'Reliquia recuperada por Aziz. Su luz sigue ligada al alfil.',
  }),
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function xpProgress(progress, xpWindow) {
  if (xpWindow.maxLevel) return { ratio: 1, label: `Nivel ${progress.level} · MAX · ${progress.xp} XP` };
  const floor = chroniclesXpThresholdForLevel(progress.level);
  const span = Math.max(1, xpWindow.next - floor);
  const earned = Math.max(0, progress.xp - floor);
  return {
    ratio: clamp01(earned / span),
    label: `Nivel ${progress.level} · ${progress.xp}/${xpWindow.next} XP`,
  };
}

function resourceStatus(state, memberId) {
  const max = Math.max(1, Number(state?.rpgModifiers?.[memberId]?.abilityCharges || 1));
  const charges = Math.max(0, Number(state?.classAbilityCharges?.[memberId] ?? max));
  return { max, charges, ratio: clamp01(charges / max) };
}

function relicDetails(state, memberId) {
  const relicId = chroniclesPartyRelic(state, memberId);
  if (!relicId) return null;
  return {
    id: relicId,
    ...(RELIC_LABELS[relicId] || {
      name: relicId,
      description: 'Reliquia vinculada a este miembro de la compañía.',
    }),
  };
}

export default function ChroniclesCharacterSheet({
  state,
  progression,
  member,
  mode = 'tactics',
  onClose,
  onAllocateAttribute = null,
  onLearnSkill = null,
  onEquipmentAction = null,
}) {
  if (!state || !progression || !member) return null;

  const profile = chroniclesTacticsEffectiveProfile(state, member.id);
  const tacticsMode = mode === 'tactics';
  const progress = chroniclesHeroProgress(progression, member.id);
  const xpWindow = chroniclesXpToNextLevel(progression, member.id);
  const xp = xpProgress(progress, xpWindow);
  const ability = resourceStatus(state, member.id);
  const attributes = chroniclesAllowedAttributes(member.id);
  const skills = chroniclesSkillsForMember(member.id);
  const modifiers = state.rpgModifiers?.[member.id] || {};
  const firstPersonStats = chroniclesPartyAttackStats(state, member.id);
  const reach = tacticsMode
    ? Number(profile.reach || 1) + Number(modifiers.reachBonus || 0)
    : firstPersonStats.reach;
  const damage = tacticsMode
    ? Number(profile.damage || 1) + Number(modifiers.attackDamageBonus || 0)
    : firstPersonStats.damage;
  const effectiveAgility = Number(member.agility || 0) + Number(modifiers.initiativeBonus || 0);
  const relic = relicDetails(state, member.id);
  const inventory = chroniclesInventoryEntries(state).filter((item) => item.id !== CHRONICLES_GOLD_ITEM_ID);
  const gold = chroniclesGoldBalance(state);
  const gearBonus = chroniclesEquipmentBonuses(state, member.id);
  const canChangeEquipment = !tacticsMode && state.phase === 'explore' && !state.initiative
    && member.hp > 0 && typeof onEquipmentAction === 'function';

  const closeOnEscape = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose?.();
  };

  const sheet = (
    <div
      className="chronicles-character-sheet__backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        className="chronicles-character-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chronicles-character-sheet-title"
        onKeyDown={closeOnEscape}
      >
        <header className="chronicles-character-sheet__head">
          <div className="chronicles-character-sheet__portrait">
            <img src={chroniclesPartyPortraitUrl(member.id)} alt={`Retrato de ${member.name}`} draggable="false" />
          </div>
          <div className="chronicles-character-sheet__identity">
            <span>EXPEDIENTE DE CAMPAÑA</span>
            <h3 id="chronicles-character-sheet-title">{member.name}</h3>
            <p>{profile.className} · {profile.weaponName}</p>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label="Cerrar ficha">×</button>
        </header>

        <div className="chronicles-character-sheet__progression">
          <div className="chronicles-character-sheet__xp-copy">
            <span>PROGRESIÓN</span>
            <b>{xp.label}</b>
          </div>
          <div className="chronicles-character-sheet__xp-track" aria-label={xp.label}>
            <i style={{ width: `${xp.ratio * 100}%` }} />
          </div>
          <small>{xpWindow.maxLevel ? 'Veterano al máximo' : `${xpWindow.remaining} XP para el siguiente nivel`}</small>
        </div>

        <div className="chronicles-character-sheet__vitals">
          <div><span>HP</span><b>{member.hp}/{member.maxHp}</b></div>
          {tacticsMode
            ? <div><span>RECURSO</span><b>{ability.charges}/{ability.max}</b></div>
            : <div><span>AGILIDAD</span><b>{effectiveAgility}</b></div>}
          <div><span>DAÑO</span><b>{damage}</b></div>
          {!tacticsMode && <div><span>REDUCCIÓN</span><b>{gearBonus.damageReduction}</b></div>}
          <div><span>ALCANCE</span><b>{reach}</b></div>
        </div>

        <div className="chronicles-character-sheet__combat">
          <div><span>Clase</span><b>{profile.className}</b></div>
          <div><span>Arma</span><b>{profile.weaponName}</b></div>
          <div><span>Ataque</span><b>{member.attackName || profile.attackName}</b></div>
          <div><span>Geometría</span><b>{profile.kindLabel}</b></div>
          <div><span>{tacticsMode ? 'Habilidad' : 'Habilidad táctica'}</span><b>{profile.abilityName}</b></div>
          <div><span>Estado</span><b>{member.hp > 0 ? 'Operativo' : 'Fuera de combate'}</b></div>
        </div>

        <div className="chronicles-character-sheet__section">
          <div className="chronicles-character-sheet__section-head">
            <div><span>EQUIPO Y OBJETOS</span><small>Equipo personal y botín de la expedición</small></div>
            <b aria-label={`Oro de la compañía: ${gold}`}>{gold} oro</b>
          </div>
          <div className="chronicles-character-sheet__loadout">
            <article className={relic ? 'has-relic' : ''}>
              <span>Reliquia vinculada</span>
              <b>{relic?.name || 'Ninguna'}</b>
              <small>{relic?.description || 'Este personaje no lleva una reliquia vinculada.'}</small>
            </article>
            {!tacticsMode && <article className="chronicles-character-sheet__equipment">
              <span>Armas y armaduras equipadas</span>
              {CHRONICLES_EQUIPMENT_SLOTS.map((slot) => {
                const worn = chroniclesEquippedItem(state, member.id, slot);
                return (
                  <div className="chronicles-character-sheet__gear-slot" key={slot}>
                    <small>{slot === 'weapon' ? 'Arma' : 'Armadura'}</small>
                    <strong>{worn?.name || 'Sin equipar'}</strong>
                    {worn && <button type="button" disabled={!canChangeEquipment}
                      onClick={() => onEquipmentAction?.({ type: 'unequip-item', slot })}>
                      Guardar en mochila
                    </button>}
                  </div>
                );
              })}
              <small>Daño +{gearBonus.attackDamageBonus} · mitigación {gearBonus.damageReduction}. Sólo cuenta el equipo puesto.</small>
              {Object.values(CHRONICLES_EQUIPMENT)
                .filter((item) => inventory.some((owned) => owned.id === item.id && owned.quantity > 0))
                .map((item) => (
                  <button type="button" key={item.id}
                    disabled={!canChangeEquipment || !item.allowedMembers.includes(member.id)}
                    title={item.description}
                    onClick={() => onEquipmentAction?.({ type: 'equip-item', itemId: item.id })}>
                    Equipar {item.name} · {item.description}
                  </button>
                ))}
            </article>}
            <article>
              <span>Mochila de expedición</span>
              {inventory.length ? (
                <div className="chronicles-character-sheet__inventory">
                  {inventory.map((item) => (
                    <em key={item.id} title={item.description || item.name}>
                      {item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}
                    </em>
                  ))}
                </div>
              ) : (
                <small>Sin objetos recuperados en esta expedición.</small>
              )}
            </article>
          </div>
        </div>

        <div className="chronicles-character-sheet__section">
          <div className="chronicles-character-sheet__section-head">
            <div><span>ATRIBUTOS</span><small>Bonificadores persistentes entre niveles y expediciones</small></div>
            <b>{progress.attributePoints} punto{progress.attributePoints === 1 ? '' : 's'} libre{progress.attributePoints === 1 ? '' : 's'}</b>
          </div>
          <div className="chronicles-character-sheet__attribute-grid">
            {attributes.map((attributeKey) => {
              const definition = CHRONICLES_ATTRIBUTE_DEFINITIONS[attributeKey];
              const value = Number(progress.attributes?.[attributeKey] || 0);
              const canSpend = typeof onAllocateAttribute === 'function'
                && progress.attributePoints > 0
                && value < CHRONICLES_ATTRIBUTE_CAP;
              return (
                <button
                  type="button"
                  key={attributeKey}
                  disabled={!canSpend}
                  title={definition.effect}
                  onClick={() => onAllocateAttribute?.(member.id, attributeKey)}
                >
                  <span><b>{definition.label}</b><small>{definition.effect}</small></span>
                  <strong>{value}/{CHRONICLES_ATTRIBUTE_CAP}</strong>
                  <i aria-hidden="true">{canSpend ? '+' : '·'}</i>
                </button>
              );
            })}
          </div>
        </div>

        <div className="chronicles-character-sheet__section">
          <div className="chronicles-character-sheet__section-head">
            <div><span>TÉCNICAS Y GRIMORIO</span><small>Doctrinas aprendidas y caminos de especialización</small></div>
            <b>{progress.skillPoints} punto{progress.skillPoints === 1 ? '' : 's'} libre{progress.skillPoints === 1 ? '' : 's'}</b>
          </div>
          <div className="chronicles-character-sheet__skill-grid">
            {skills.map((skill) => {
              const learned = progress.skills.includes(skill.id);
              const competing = skills.some((candidate) => (
                candidate.id !== skill.id
                && candidate.group === skill.group
                && progress.skills.includes(candidate.id)
              ));
              const levelLocked = progress.level < skill.requiredLevel;
              const canLearn = typeof onLearnSkill === 'function'
                && !learned
                && !competing
                && !levelLocked
                && progress.skillPoints >= skill.cost;
              const status = learned
                ? 'Aprendida'
                : competing
                  ? 'Rama cerrada'
                  : levelLocked
                    ? `Requiere Nv ${skill.requiredLevel}`
                    : `${skill.cost} punto`;
              return (
                <button
                  type="button"
                  key={skill.id}
                  className={learned ? 'is-learned' : ''}
                  disabled={!canLearn}
                  onClick={() => onLearnSkill?.(member.id, skill.id)}
                >
                  <span><b>{skill.label}</b><small>{skill.description}</small></span>
                  <strong>{status}</strong>
                </button>
              );
            })}
          </div>
        </div>

        <footer className="chronicles-character-sheet__foot">
          <span>{member.attackName || profile.attackName} · daño {damage} · alcance {reach}</span>
          <span>Esc · cerrar</span>
        </footer>
      </section>
    </div>
  );

  if (typeof document === 'undefined') return sheet;
  return createPortal(sheet, document.body);
}
