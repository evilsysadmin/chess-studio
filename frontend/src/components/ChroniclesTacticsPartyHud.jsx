import { useEffect, useMemo, useRef, useState } from 'react';
import {
  chroniclesActiveQuest,
  chroniclesInventoryEntries,
  chroniclesQuestEntries,
} from '../chronicles/chroniclesContentRuntime.js';
import {
  chroniclesHasUnspentProgression,
  chroniclesHeroProgress,
} from '../chroniclesOfMatthiasProgression.js';
import {
  chroniclesTacticsAbilityStatus,
  chroniclesTacticsProfile,
} from '../chroniclesOfMatthiasTactics.js';
import ChroniclesCharacterSheet from './ChroniclesCharacterSheet.jsx';
import { chroniclesPartyPortraitUrl } from '../chronicles/chroniclesPartyPortraitAssets.js';
import { chroniclesRetaliationCue } from '../chroniclesOfMatthiasRetaliation.js';
import './ChroniclesTacticsPartyHud.css';
import './ChroniclesCharacterSheet.css';
import './ChroniclesTacticsAdventureSummary.css';

const PARTY_ORDER = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);

function clampRatio(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
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
  onSheetOpenChange = null,
  onAllocateAttribute,
  onLearnSkill,
}) {
  const [sheetMemberId, setSheetMemberId] = useState(null);
  const [damageCue, setDamageCue] = useState(null);
  const previousStateRef = useRef(state);
  const damageCueTimerRef = useRef(null);
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

  useEffect(() => {
    const previous = previousStateRef.current;
    previousStateRef.current = state;
    const cue = chroniclesRetaliationCue(previous, state);
    if (!cue) return;
    if (damageCueTimerRef.current) window.clearTimeout(damageCueTimerRef.current);
    setDamageCue({ ...cue, token: Date.now() });
    damageCueTimerRef.current = window.setTimeout(() => {
      setDamageCue(null);
      damageCueTimerRef.current = null;
    }, 1800);
  }, [state]);

  useEffect(() => () => {
    if (damageCueTimerRef.current) window.clearTimeout(damageCueTimerRef.current);
  }, []);

  useEffect(() => {
    const memberId = sheetRequest?.memberId;
    if (!memberId) return;
    onSelectMember(memberId);
    onSheetOpenChange?.(true);
    setSheetMemberId(memberId);
  }, [onSelectMember, onSheetOpenChange, sheetRequest]);

  const openSheet = (memberId) => {
    onSelectMember(memberId);
    onSheetOpenChange?.(true);
    setSheetMemberId(memberId);
  };

  const closeSheet = () => {
    onSheetOpenChange?.(false);
    setSheetMemberId(null);
  };

  return (
    <>
      <aside className="chronicles-tactics__party chronicles-party-hud" aria-label="Compañía">
        <span className="chronicles-tactics__kicker">COMPAÑÍA · 1–4 · DOBLE FICHA</span>
        {party.map((member, index) => {
          const profile = chroniclesTacticsProfile(member.id);
          const progress = chroniclesHeroProgress(progression, member.id);
          const upgradeReady = chroniclesHasUnspentProgression(progression, member.id);
          const ability = abilityResource(state, member.id);
          const hpRatio = clampRatio(member.hp / member.maxHp);
          const selected = member.id === selectedMemberId;
          const fallen = member.hp <= 0;
          return (
            <div
              key={member.id}
              className={`chronicles-party-hud__member${selected ? ' is-selected' : ''}${fallen ? ' is-fallen' : ''}`}
              data-member-id={member.id}
              data-member-hp={member.hp}
              data-damage-hit={damageCue?.targetId === member.id ? 'true' : undefined}
            >
              <button
                type="button"
                className="chronicles-party-hud__portrait"
                onClick={() => openSheet(member.id)}
                aria-label={`Abrir ficha de ${member.name}`}
                title={`Ficha de ${member.name}`}
              >
                <span className="chronicles-party-hud__portrait-frame" aria-hidden="true">
                  <img src={chroniclesPartyPortraitUrl(member.id)} alt="" />
                  {damageCue?.targetId === member.id ? (
                    <span
                      key={damageCue.token}
                      className="chronicles-party-hud__damage-slash"
                    />
                  ) : null}
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
                  {upgradeReady && <em className="chronicles-party-hud__upgrade">↑ MEJORA</em>}
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

      {sheetMember && (
        <ChroniclesCharacterSheet
          state={state}
          progression={progression}
          member={sheetMember}
          onClose={closeSheet}
          onAllocateAttribute={onAllocateAttribute}
          onLearnSkill={onLearnSkill}
        />
      )}
    </>
  );
}
