import { useEffect, useMemo, useState } from 'react';
import {
  chroniclesActiveQuest,
  chroniclesInventoryEntries,
  chroniclesQuestEntries,
} from '../chronicles/chroniclesContentRuntime.js';
import {
  CHRONICLES_ATTRIBUTE_CAP,
  CHRONICLES_ATTRIBUTE_DEFINITIONS,
  chroniclesAllowedAttributes,
  chroniclesHeroProgress,
  chroniclesSkillsForMember,
  chroniclesXpToNextLevel,
} from '../chroniclesOfMatthiasProgression.js';
import {
  chroniclesTacticsAbilityStatus,
  chroniclesTacticsProfile,
} from '../chroniclesOfMatthiasTactics.js';
import './ChroniclesTacticsPartyHud.css';
import './ChroniclesTacticsAdventureSummary.css';

const PARTY_ORDER = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);

function clampRatio(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function xpLabel(progress, xpWindow) {
  if (xpWindow.maxLevel) return `Nv ${progress.level} · MAX · ${progress.xp} XP`;
  return `Nv ${progress.level} · ${progress.xp}/${xpWindow.next} XP`;
}

function abilityResource(state, memberId) {
  const status = chroniclesTacticsAbilityStatus(state, memberId);
  const max = Math.max(1, Number(state?.rpgModifiers?.[memberId]?.abilityCharges || 1));
  return {
    ...status,
    max,
    ratio: clampRatio(status.charges / max),
  };
}

function VitalBar({ kind, label, value, max, ratio }) {
  return (
    <span className={`chronicles-party-hud__vital chronicles-party-hud__vital--${kind}`}>
      <span className="chronicles-party-hud__vital-track" aria-hidden="true">
        <i style={{ width: `${clampRatio(ratio) * 100}%` }} />
      </span>
      <b>{label}</b>
      <small>{value}/{max}</small>
    </span>
  );
}

export default function ChroniclesTacticsPartyHud({
  state,
  progression,
  selectedMemberId,
  sheetRequest = null,
  onSelectMember,
  onAllocateAttribute,
  onLearnSkill,
}) {
  const [sheetMemberId, setSheetMemberId] = useState(null);
  const party = useMemo(
    () => PARTY_ORDER.map((id) => state.party.find((member) => member.id === id)).filter(Boolean),
    [state.party],
  );
  const activeQuest = chroniclesActiveQuest(state);
  const inventoryItems = chroniclesInventoryEntries(state);
  const completedQuestCount = chroniclesQuestEntries(state, 'completed').length;
  const inventoryCount = inventoryItems.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const hasAdventureState = Boolean(activeQuest || inventoryItems.length || completedQuestCount);
  const sheetMember = sheetMemberId
    ? party.find((member) => member.id === sheetMemberId) || null
    : null;
  const sheetProfile = sheetMember ? chroniclesTacticsProfile(sheetMember.id) : null;
  const sheetProgress = sheetMember ? chroniclesHeroProgress(progression, sheetMember.id) : null;
  const sheetXpWindow = sheetMember ? chroniclesXpToNextLevel(progression, sheetMember.id) : null;
  const sheetAbility = sheetMember ? abilityResource(state, sheetMember.id) : null;
  const sheetAttributes = sheetMember ? chroniclesAllowedAttributes(sheetMember.id) : [];
  const sheetSkills = sheetMember ? chroniclesSkillsForMember(sheetMember.id) : [];
  const sheetModifiers = sheetMember ? state.rpgModifiers?.[sheetMember.id] || {} : {};
  const sheetReach = sheetProfile ? sheetProfile.reach + Number(sheetModifiers.reachBonus || 0) : 0;

  useEffect(() => {
    const memberId = sheetRequest?.memberId;
    if (!memberId) return;
    onSelectMember(memberId);
    setSheetMemberId(memberId);
  }, [onSelectMember, sheetRequest]);

  const openSheet = (memberId) => {
    onSelectMember(memberId);
    setSheetMemberId(memberId);
  };

  const closeSheet = () => setSheetMemberId(null);

  const onSheetKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeSheet();
  };

  return (
    <>
      <aside className="chronicles-tactics__party chronicles-party-hud" aria-label="Compañía">
        <span className="chronicles-tactics__kicker">COMPAÑÍA · 1–4</span>
        {party.map((member, index) => {
          const profile = chroniclesTacticsProfile(member.id);
          const progress = chroniclesHeroProgress(progression, member.id);
          const ability = abilityResource(state, member.id);
          const hpRatio = clampRatio(member.hp / member.maxHp);
          const selected = member.id === selectedMemberId;
          const fallen = member.hp <= 0;
          return (
            <div
              key={member.id}
              className={`chronicles-party-hud__member${selected ? ' is-selected' : ''}${fallen ? ' is-fallen' : ''}`}
              data-member-id={member.id}
            >
              <button
                type="button"
                className="chronicles-party-hud__portrait"
                onClick={() => openSheet(member.id)}
                aria-label={`Abrir ficha de ${member.name}`}
                title={`Ficha de ${member.name}`}
              >
                <span className="chronicles-party-hud__portrait-frame" aria-hidden="true">
                  <i>{member.glyph}</i>
                </span>
                <span className="chronicles-party-hud__hotkey" aria-hidden="true">{index + 1}</span>
              </button>
              <button
                type="button"
                className="chronicles-party-hud__select"
                onClick={() => onSelectMember(member.id)}
                aria-pressed={selected}
              >
                <span className="chronicles-party-hud__identity">
                  <b>{member.name}</b>
                  <small>Nv {progress.level} · {profile.className}</small>
                </span>
                <VitalBar kind="hp" label="HP" value={member.hp} max={member.maxHp} ratio={hpRatio} />
                <VitalBar kind="mp" label="MP" value={ability.charges} max={ability.max} ratio={ability.ratio} />
              </button>
            </div>
          );
        })}
        <small className="chronicles-party-hud__hint">Retrato · ficha de PJ</small>

        {hasAdventureState && (
          <details className="chronicles-party-hud__adventure">
            <summary>
              <span>Botín y encargos</span>
              <b>{activeQuest ? '1 misión' : 'sin misión'} · {inventoryCount} objeto{inventoryCount === 1 ? '' : 's'}</b>
            </summary>
            <div className="chronicles-party-hud__adventure-body">
              {activeQuest && (
                <section className="chronicles-party-hud__adventure-section">
                  <span>Misión activa</span>
                  <strong>{activeQuest.title}</strong>
                  {activeQuest.objective && <small>{activeQuest.objective}</small>}
                </section>
              )}
              {inventoryItems.length > 0 && (
                <section className="chronicles-party-hud__adventure-section">
                  <span>Mochila</span>
                  <div className="chronicles-party-hud__inventory">
                    {inventoryItems.map((item) => (
                      <span
                        key={item.id}
                        className="chronicles-party-hud__inventory-item"
                        title={item.description || item.name}
                      >
                        {item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}
                      </span>
                    ))}
                  </div>
                </section>
              )}
              {completedQuestCount > 0 && (
                <small className="chronicles-party-hud__adventure-complete">
                  {completedQuestCount} encargo{completedQuestCount === 1 ? '' : 's'} completado{completedQuestCount === 1 ? '' : 's'}
                </small>
              )}
            </div>
          </details>
        )}
      </aside>

      {sheetMember && sheetProfile && sheetProgress && sheetXpWindow && sheetAbility && (
        <div
          className="chronicles-character-sheet__backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSheet();
          }}
        >
          <section
            className="chronicles-character-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chronicles-character-sheet-title"
            onKeyDown={onSheetKeyDown}
          >
            <header className="chronicles-character-sheet__head">
              <div className="chronicles-character-sheet__portrait" aria-hidden="true">{sheetMember.glyph}</div>
              <div>
                <span>EXPEDIENTE DE CAMPAÑA</span>
                <h3 id="chronicles-character-sheet-title">{sheetMember.name}</h3>
                <p>{sheetProfile.className} · {sheetProfile.weaponName}</p>
              </div>
              <button type="button" autoFocus onClick={closeSheet} aria-label="Cerrar ficha">×</button>
            </header>

            <div className="chronicles-character-sheet__vitals">
              <VitalBar
                kind="hp"
                label="HP"
                value={sheetMember.hp}
                max={sheetMember.maxHp}
                ratio={sheetMember.hp / sheetMember.maxHp}
              />
              <VitalBar
                kind="mp"
                label="MP"
                value={sheetAbility.charges}
                max={sheetAbility.max}
                ratio={sheetAbility.ratio}
              />
              <div className="chronicles-character-sheet__xp">
                <span>PROGRESIÓN</span>
                <b>{xpLabel(sheetProgress, sheetXpWindow)}</b>
              </div>
            </div>

            <div className="chronicles-character-sheet__combat">
              <div><span>Clase</span><b>{sheetProfile.className}</b></div>
              <div><span>Arma</span><b>{sheetProfile.weaponName}</b></div>
              <div><span>Ataque</span><b>{sheetProfile.attackName}</b></div>
              <div><span>Geometría</span><b>{sheetProfile.kindLabel}</b></div>
              <div><span>Alcance</span><b>{sheetReach}</b></div>
              <div><span>Habilidad</span><b>{sheetProfile.abilityName}</b></div>
            </div>

            <div className="chronicles-character-sheet__section">
              <div className="chronicles-character-sheet__section-head">
                <div><span>ATRIBUTOS</span><small>Impacto mecánico real</small></div>
                <b>{sheetProgress.attributePoints} punto{sheetProgress.attributePoints === 1 ? '' : 's'} libre{sheetProgress.attributePoints === 1 ? '' : 's'}</b>
              </div>
              <div className="chronicles-character-sheet__attribute-grid">
                {sheetAttributes.map((attributeKey) => {
                  const definition = CHRONICLES_ATTRIBUTE_DEFINITIONS[attributeKey];
                  const value = Number(sheetProgress.attributes?.[attributeKey] || 0);
                  const disabled = sheetProgress.attributePoints <= 0 || value >= CHRONICLES_ATTRIBUTE_CAP;
                  return (
                    <button
                      type="button"
                      key={attributeKey}
                      disabled={disabled}
                      title={definition.effect}
                      onClick={() => onAllocateAttribute(sheetMember.id, attributeKey)}
                    >
                      <span><b>{definition.label}</b><small>{definition.effect}</small></span>
                      <strong>{value}/{CHRONICLES_ATTRIBUTE_CAP}</strong>
                      <i aria-hidden="true">+</i>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="chronicles-character-sheet__section">
              <div className="chronicles-character-sheet__section-head">
                <div><span>TÉCNICAS</span><small>Una doctrina, decisiones con coste</small></div>
                <b>{sheetProgress.skillPoints} punto{sheetProgress.skillPoints === 1 ? '' : 's'} libre{sheetProgress.skillPoints === 1 ? '' : 's'}</b>
              </div>
              <div className="chronicles-character-sheet__skill-grid">
                {sheetSkills.map((skill) => {
                  const learned = sheetProgress.skills.includes(skill.id);
                  const competing = sheetSkills.some((candidate) => (
                    candidate.id !== skill.id
                    && candidate.group === skill.group
                    && sheetProgress.skills.includes(candidate.id)
                  ));
                  const levelLocked = sheetProgress.level < skill.requiredLevel;
                  const disabled = learned || competing || levelLocked || sheetProgress.skillPoints < skill.cost;
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
                      disabled={disabled}
                      onClick={() => onLearnSkill(sheetMember.id, skill.id)}
                    >
                      <span><b>{skill.label}</b><small>{skill.description}</small></span>
                      <strong>{status}</strong>
                    </button>
                  );
                })}
              </div>
            </div>

            <footer className="chronicles-character-sheet__foot">
              <span>{sheetMember.hp > 0 ? `${sheetProfile.attackName} · alcance ${sheetReach}` : 'Fuera de combate'}</span>
              <span>Esc · cerrar</span>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
