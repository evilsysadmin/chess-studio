import { useState } from 'react';
import { createPortal } from 'react-dom';
import './ChroniclesCharacterSheetFolioV2.css';
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
  chroniclesMemberCanEquip,
} from '../chronicles/chroniclesEquipment.js';
import { chroniclesPartyArmorClass, chroniclesPartyAttackStats } from '../chroniclesOfMatthias.js';
import { chroniclesPartyInitiativeAgility } from '../chronicles/chroniclesInitiative.js';
import {
  CHRONICLES_MM3_STATS,
  CHRONICLES_MM3_STAT_EFFECTS,
  CHRONICLES_MM3_STAT_LABELS,
} from '../chronicles/chroniclesMM3Rules.js';
import { chroniclesTacticsEffectiveProfile } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesPartyPortraitUrl } from '../chronicles/chroniclesPartyPortraitAssets.js';
import {
  CHRONICLES_SPELL_SCHOOLS,
  chroniclesMemberMaxSp,
  chroniclesMemberSchool,
  chroniclesMemberSp,
  chroniclesMemberSpells,
} from '../chronicles/chroniclesMagic.js';

const RELIC_LABELS = Object.freeze({
  'spectral-lantern': Object.freeze({
    name: 'Farol espectral',
    description: 'Reliquia recuperada por Aziz. Su luz sigue ligada al alfil.',
  }),
});

function signed(value) {
  const numeric = Number(value) || 0;
  return numeric > 0 ? `+${numeric}` : String(numeric);
}

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
  onSelectMember = null,
}) {
  // Navigation belongs to the sheet, not the durable campaign state.
  const [activeFolio, setActiveFolio] = useState('record');
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
  const equippedWeapon = chroniclesEquippedItem(state, member.id, 'weapon');
  const reach = tacticsMode
    ? Number(profile.reach || 1) + Number(modifiers.reachBonus || 0)
    : firstPersonStats.reach;
  const damage = tacticsMode
    ? Number(profile.damage || 1) + Number(modifiers.attackDamageBonus || 0)
    : firstPersonStats.damage;
  const effectiveAgility = chroniclesPartyInitiativeAgility(state, member);
  const mm3 = !tacticsMode && member.mm3 ? member.mm3 : null;
  const className = mm3?.classLabel || profile.className;
  const relic = relicDetails(state, member.id);
  const inventory = chroniclesInventoryEntries(state).filter((item) => item.id !== CHRONICLES_GOLD_ITEM_ID);
  const gold = chroniclesGoldBalance(state);
  const gearBonus = chroniclesEquipmentBonuses(state, member.id);
  const canChangeEquipment = !tacticsMode && state.phase === 'explore' && !state.initiative
    && member.hp > 0 && typeof onEquipmentAction === 'function';

  const closeOnEscape = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
      return;
    }
    // The classic party portraits are also hotkeys; they must never move
    // the squad while a character sheet is open.
    if (!tacticsMode && /^[1-4]$/.test(event.key) && !event.altKey && !event.metaKey && !event.ctrlKey) {
      const hero = state.party[Number(event.key) - 1];
      if (!hero || !onSelectMember) return;
      event.preventDefault();
      event.stopPropagation();
      onSelectMember(hero.id);
    }
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
        className={`chronicles-character-sheet${tacticsMode ? '' : ' chronicles-character-sheet--mm3 chronicles-character-sheet--folio-v2'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chronicles-character-sheet-title"
        data-chronicles-folio={tacticsMode ? undefined : 'v2'}
        onKeyDown={closeOnEscape}
      >
        {/* The frame (and its corner gems) stays put; only the contents scroll. */}
        <div className="chronicles-character-sheet__scroll">
        <header className="chronicles-character-sheet__head">
          <div className="chronicles-character-sheet__portrait">
            <img src={chroniclesPartyPortraitUrl(member.id)} alt={`Retrato de ${member.name}`} draggable="false" />
          </div>
          <div className="chronicles-character-sheet__identity">
            <span>EXPEDIENTE DE CAMPAÑA</span>
            <h3 id="chronicles-character-sheet-title">{member.name}</h3>
            <p>{className} · Nivel {progress.level}{mm3 ? '' : ` · ${profile.weaponName}`}</p>
            {!tacticsMode && (
              <div className="chronicles-character-sheet__quick" aria-label="Recursos actuales">
                <span>PV <b>{member.hp}/{member.maxHp}</b></span>
                {chroniclesMemberSchool(member) && (
                  <span>PH <b>{chroniclesMemberSp(state, member)}/{chroniclesMemberMaxSp(state, member)}</b></span>
                )}
                <span>ORO <b>{gold}</b></span>
              </div>
            )}
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

        {!tacticsMode && (
          <nav className="chronicles-character-sheet__tabs" aria-label="Apartados de la ficha">
            {[
              { id: 'record', symbol: '◆', label: 'Estado' },
              { id: 'equipment', symbol: '⚔', label: 'Equipo' },
              { id: 'spells', symbol: '✧', label: 'Hechizos' },
              { id: 'training', symbol: '✦', label: 'Mejoras' },
            ].map((tab) => (
              <button type="button" key={tab.id}
                className={activeFolio === tab.id ? 'is-active' : ''}
                aria-pressed={activeFolio === tab.id}
                onClick={() => setActiveFolio(tab.id)}
              ><span aria-hidden="true">{tab.symbol}</span>{tab.label}</button>
            ))}
          </nav>
        )}

        <div className="chronicles-character-sheet__vitals"
          hidden={!tacticsMode && activeFolio !== 'record'}>
          <div><span>HP</span><b>{member.hp}/{member.maxHp}</b></div>
          {tacticsMode
            ? <div><span>RECURSO</span><b>{ability.charges}/{ability.max}</b></div>
            : <div><span>INICIATIVA</span><b>{effectiveAgility}</b></div>}
          <div><span>DAÑO</span><b>{damage}</b></div>
          {mm3 && <div><span>ACIERTO</span><b>{signed(firstPersonStats.toHit)}</b></div>}
          {mm3 && <div><span>ARMADURA</span><b>{chroniclesPartyArmorClass(state, member.id)}</b></div>}
          {!tacticsMode && !mm3 && <div><span>REDUCCIÓN</span><b>{gearBonus.damageReduction}</b></div>}
          <div><span>ALCANCE</span><b>{reach}</b></div>
        </div>

        <div className="chronicles-character-sheet__combat"
          hidden={!tacticsMode && activeFolio !== 'record'}>
          <div><span>Clase</span><b>{className}</b></div>
          <div><span>Arma</span><b>{mm3 ? (equippedWeapon?.name || 'Sin arma') : profile.weaponName}</b></div>
          {mm3 ? (
            <div><span>Tipo</span><b>{equippedWeapon?.reach > 1 ? 'A distancia' : 'Cuerpo a cuerpo'}</b></div>
          ) : (
            <>
              <div><span>Ataque</span><b>{member.attackName || profile.attackName}</b></div>
              <div><span>Geometría</span><b>{profile.kindLabel}</b></div>
              <div><span>{tacticsMode ? 'Habilidad' : 'Habilidad táctica'}</span><b>{profile.abilityName}</b></div>
            </>
          )}
          <div><span>Estado</span><b>{member.hp > 0 ? 'Operativo' : 'Fuera de combate'}</b></div>
        </div>

        {mm3 && (
          <div className="chronicles-character-sheet__section chronicles-character-sheet__section--core-stats"
            hidden={activeFolio !== 'record'}>
            <div className="chronicles-character-sheet__section-head">
              <div><span>ESTADÍSTICAS</span><small>Tiradas de creación · bonificador MM3 entre paréntesis</small></div>
            </div>
            <div className="chronicles-character-sheet__mm3-stats">
              {CHRONICLES_MM3_STATS.map((key) => (
                <div key={key} data-stat={key} title={CHRONICLES_MM3_STAT_EFFECTS[key]}>
                  <span>{CHRONICLES_MM3_STAT_LABELS[key]}</span>
                  <b>{mm3.stats[key]} <em>({signed(mm3.bonuses[key])})</em></b>
                  <small>{CHRONICLES_MM3_STAT_EFFECTS[key]}</small>
                </div>
              ))}
            </div>
          </div>
        )}

        {mm3 && chroniclesMemberSchool(member) && (
          <div className="chronicles-character-sheet__section"
            hidden={activeFolio !== 'spells'}
            data-chronicles-spellbook={member.id}>
            <div className="chronicles-character-sheet__section-head">
              <div>
                <span>LIBRO DE HECHIZOS</span>
                <small>{CHRONICLES_SPELL_SCHOOLS[chroniclesMemberSchool(member)].label} · {CHRONICLES_SPELL_SCHOOLS[chroniclesMemberSchool(member)].summary} Más hechizos en el gremio.</small>
              </div>
              <b>{chroniclesMemberSp(state, member)}/{chroniclesMemberMaxSp(state, member)} PH</b>
            </div>
            <div className="chronicles-character-sheet__loadout">
              {chroniclesMemberSpells(state, member).map((spell) => (
                <article key={spell.id}>
                  <span>{spell.cost} PH</span>
                  <b>{spell.name}</b>
                  <small>{spell.description}</small>
                </article>
              ))}
            </div>
          </div>
        )}

        {!tacticsMode && !chroniclesMemberSchool(member) && activeFolio === 'spells' && (
          <div className="chronicles-character-sheet__section chronicles-character-sheet__no-spells">
            <span>✧</span>
            <p>Este personaje no practica ninguna escuela de magia.</p>
          </div>
        )}

        <div className="chronicles-character-sheet__section"
          hidden={!tacticsMode && activeFolio !== 'equipment'}>
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
                    <small>{{ weapon: 'Arma', armor: 'Armadura', shield: 'Escudo' }[slot]}</small>
                    <strong>{worn?.name || 'Sin equipar'}</strong>
                    {worn && <button type="button" disabled={!canChangeEquipment}
                      onClick={() => onEquipmentAction?.({ type: 'unequip-item', slot })}>
                      Guardar en mochila
                    </button>}
                  </div>
                );
              })}
              <small>
                {mm3
                  ? `Daño +${gearBonus.attackDamageBonus} · acierto ${signed(gearBonus.toHitBonus)} · armadura +${gearBonus.armorClassBonus}. Sólo cuenta el equipo puesto.`
                  : `Daño +${gearBonus.attackDamageBonus} · mitigación ${gearBonus.damageReduction}. Sólo cuenta el equipo puesto.`}
              </small>
              {Object.values(CHRONICLES_EQUIPMENT)
                .filter((item) => inventory.some((owned) => owned.id === item.id && owned.quantity > 0))
                .map((item) => (
                  <button type="button" key={item.id}
                    disabled={!canChangeEquipment || !chroniclesMemberCanEquip(member, item)}
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

        <div className="chronicles-character-sheet__section"
          hidden={!tacticsMode && activeFolio !== 'training'}>
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

        <div className="chronicles-character-sheet__section"
          hidden={!tacticsMode && activeFolio !== 'training'}>
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
        </div>
        {!tacticsMode && (
          <nav className="chronicles-character-sheet__party-dock" aria-label="Seleccionar personaje de la compañía">
            {(state.party || []).slice(0, 4).map((hero, index) => (
              <button type="button" key={hero.id}
                disabled={!onSelectMember}
                aria-label={`Ver ficha de ${hero.name}`}
                aria-pressed={hero.id === member.id}
                onClick={() => onSelectMember?.(hero.id)}
              >
                <span className="chronicles-character-sheet__party-number" aria-hidden="true">{index + 1}</span>
                <img src={chroniclesPartyPortraitUrl(hero.id)} alt="" draggable="false" />
                <span className="chronicles-character-sheet__party-name">{hero.name}</span>
                <span className="chronicles-character-sheet__party-hp">{hero.hp}/{hero.maxHp} PV</span>
              </button>
            ))}
          </nav>
        )}
      </section>
    </div>
  );

  if (typeof document === 'undefined') return sheet;
  return createPortal(sheet, document.body);
}
