import { useEffect, useMemo, useState } from 'react';
import { CHRONICLES_PARTY } from '../chroniclesOfMatthias.js';
import {
  chroniclesRollCharacterStats,
  createCanonicalChroniclesCharacterBuild,
  normalizeChroniclesCharacterBuild,
  validateChroniclesCharacterBuild,
} from '../chronicles/chroniclesCharacterBuilds.js';
import {
  CHRONICLES_MM3_CLASSES,
  CHRONICLES_MM3_CLASS_IDS,
  CHRONICLES_MM3_STATS,
  CHRONICLES_MM3_STAT_EFFECTS,
  CHRONICLES_MM3_STAT_LABELS,
  CHRONICLES_MM3_STAT_SHORT,
  chroniclesMM3Derived,
  chroniclesMM3UnmetRequirements,
} from '../chronicles/chroniclesMM3Rules.js';
import { chroniclesPartyPortraitUrl } from '../chronicles/chroniclesPartyPortraitAssets.js';
import {
  clearChroniclesCharacterDraft,
  loadChroniclesCharacterDraft,
  saveChroniclesCharacterDraft,
} from '../chronicles/chroniclesCharacterDraft.js';
import { clearRememberedLabMode, rememberLabMode } from '../labLaunchIntent.js';
import './ChroniclesCharacterSetup.css';

function customFrom(build) {
  const normalized = normalizeChroniclesCharacterBuild(build, CHRONICLES_PARTY);
  return {
    ...normalized,
    mode: 'custom',
    characters: normalized.characters.map((character) => ({
      ...character,
      stats: { ...character.stats },
    })),
  };
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function requirementText(classId) {
  return Object.entries(CHRONICLES_MM3_CLASSES[classId].requirements)
    .map(([stat, need]) => `${CHRONICLES_MM3_STAT_SHORT[stat]} ${need}`)
    .join(' · ');
}

export default function ChroniclesCharacterSetup({
  currentBuild,
  onConfirm,
  onExit,
  recoveryLabMode = null,
}) {
  const normalizedCurrent = useMemo(
    () => normalizeChroniclesCharacterBuild(currentBuild, CHRONICLES_PARTY),
    [currentBuild],
  );
  const [recoveredDraft, setRecoveredDraft] = useState(() => loadChroniclesCharacterDraft(CHRONICLES_PARTY));
  const [editing, setEditing] = useState(() => Boolean(recoveredDraft));
  const [rolls, setRolls] = useState(0);
  const [activeSlot, setActiveSlot] = useState(() => recoveredDraft?.activeSlot || 'matthias');
  const [draft, setDraft] = useState(() => (
    recoveredDraft?.build ? customFrom(recoveredDraft.build) : customFrom(normalizedCurrent)
  ));

  useEffect(() => {
    if (!editing) return;
    const saved = saveChroniclesCharacterDraft({ activeSlot, build: draft }, CHRONICLES_PARTY);
    if (saved && recoveryLabMode) rememberLabMode(recoveryLabMode);
  }, [activeSlot, draft, editing, recoveryLabMode]);

  const clearRecovery = () => {
    clearChroniclesCharacterDraft();
    clearRememberedLabMode();
  };

  const confirmBuild = (build) => {
    clearRecovery();
    onConfirm(build);
  };

  const leaveSetup = () => {
    clearRecovery();
    onExit();
  };

  const leaveEditor = () => {
    clearRecovery();
    setRecoveredDraft(null);
    setDraft(customFrom(normalizedCurrent));
    setActiveSlot('matthias');
    setEditing(false);
  };

  const activeCharacter = draft.characters.find((character) => character.slotId === activeSlot) || draft.characters[0];
  const derived = chroniclesMM3Derived(activeCharacter.classId, activeCharacter.stats);
  const validation = validateChroniclesCharacterBuild(draft);

  const beginCustom = () => {
    setRecoveredDraft(null);
    setDraft(customFrom(normalizedCurrent));
    setActiveSlot('matthias');
    setEditing(true);
  };

  const patchCharacter = (slotId, patch) => {
    setDraft((current) => ({
      ...current,
      mode: 'custom',
      characters: current.characters.map((character) => (
        character.slotId === slotId ? { ...character, ...patch } : character
      )),
    }));
  };

  // MM3 roller: reroll all seven stats as often as you like; keep the class
  // if the new roll still qualifies, otherwise fall to the first that does.
  const rerollStats = () => {
    const { stats, classId } = chroniclesRollCharacterStats(Math.random, activeCharacter.classId);
    patchCharacter(activeCharacter.slotId, { stats, classId });
    setRolls((count) => count + 1);
  };

  const chooseClass = (classId) => {
    if (chroniclesMM3UnmetRequirements(classId, activeCharacter.stats).length) return;
    patchCharacter(activeCharacter.slotId, { classId });
  };

  if (!editing) {
    const hasCustom = normalizedCurrent.mode === 'custom';
    return (
      <div className="chronicles-character-setup" data-chronicles-character-setup="choice">
        <section className="chronicles-character-setup__panel" aria-labelledby="chronicles-character-setup-title">
          <span className="section-label">FORMAR COMPAÑÍA</span>
          <h2 id="chronicles-character-setup-title">¿Con quién bajamos ahí?</h2>
          <p>
            Puedes entrar con Matthias, Hildegard, Aziz y Faust tal como vienen de fábrica
            (Caballero, Paladín, Clérigo y Arquero), o tirar los dados y elegir sus clases.
          </p>

          {hasCustom ? (
            <div className="chronicles-character-setup__saved" data-testid="chronicles-custom-party-summary">
              <span>COMPAÑÍA GUARDADA</span>
              <strong>{normalizedCurrent.characters.map((character) => character.name).join(' · ')}</strong>
            </div>
          ) : null}

          <div className="chronicles-character-setup__actions">
            {hasCustom ? (
              <button type="button" className="primary-btn" onClick={() => confirmBuild(normalizedCurrent)}>
                Continuar con mi compañía
              </button>
            ) : (
              <button
                type="button"
                className="primary-btn"
                onClick={() => confirmBuild(createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY))}
              >
                Entrar con grupo canónico
              </button>
            )}
            <button type="button" className="secondary-btn" onClick={beginCustom}>
              {hasCustom ? 'Editar PJs' : 'Crear PJs'}
            </button>
            {hasCustom ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => confirmBuild(createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY))}
              >
                Volver al grupo canónico
              </button>
            ) : null}
            <button type="button" className="ghost-btn" onClick={leaveSetup}>← Salir</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="chronicles-character-setup" data-chronicles-character-setup="editor">
      <section className="chronicles-character-setup__panel chronicles-character-setup__panel--editor">
        <div className="chronicles-character-setup__head">
          <div>
            <span className="section-label">CREAR PERSONAJES · REGLAS MM3</span>
            <h2>Forma la compañía</h2>
            <p>Tira los dados de cada héroe tantas veces como quieras y elige una de las diez clases que su tirada permita.</p>
            {recoveredDraft ? (
              <small className="chronicles-character-setup__recovered">Borrador recuperado de esta sesión.</small>
            ) : null}
          </div>
          <button type="button" className="ghost-btn" onClick={leaveEditor}>← Volver</button>
        </div>

        <nav className="chronicles-character-setup__slots" aria-label="Personajes de la compañía">
          {draft.characters.map((character, index) => (
            <button
              type="button"
              key={character.slotId}
              className={character.slotId === activeCharacter.slotId ? 'is-active' : ''}
              onClick={() => setActiveSlot(character.slotId)}
              aria-pressed={character.slotId === activeCharacter.slotId}
            >
              <img src={chroniclesPartyPortraitUrl(character.slotId)} alt="" aria-hidden="true" />
              <span>{index + 1} · {CHRONICLES_MM3_CLASSES[character.classId]?.label}</span>
              <strong>{character.name}</strong>
            </button>
          ))}
        </nav>

        <div className="chronicles-character-setup__sheet">
          <div className="chronicles-character-setup__identity">
            <span>{CHRONICLES_MM3_CLASSES[activeCharacter.classId]?.label}</span>
            <label>
              Nombre
              <input
                aria-label={`Nombre de ${activeCharacter.slotId}`}
                value={activeCharacter.name}
                maxLength={24}
                onChange={(event) => patchCharacter(activeCharacter.slotId, { name: event.target.value })}
              />
            </label>
            <dl className="chronicles-character-setup__derived" aria-label={`Valores de combate de ${activeCharacter.name}`}>
              <div><dt>Vida</dt><dd>{derived.maxHp}</dd></div>
              <div><dt>Armadura</dt><dd>{derived.armorClass}</dd></div>
              <div><dt>Acierto</dt><dd>{signed(derived.toHit)}</dd></div>
              <div><dt>Daño</dt><dd>{signed(derived.damageBonus)}</dd></div>
            </dl>
            <small className="chronicles-character-setup__derived-note">
              La armadura sube con el equipo. Intelecto y Personalidad darán puntos de hechizo cuando llegue la magia.
            </small>
          </div>

          <section className="chronicles-character-setup__attributes" aria-label={`Estadísticas de ${activeCharacter.name}`}>
            <div className="chronicles-character-setup__section-head">
              <div>
                <span>ESTADÍSTICAS · 3D6</span>
                <strong>{rolls > 0 ? `${rolls} ${rolls === 1 ? 'tirada' : 'tiradas'} en esta sesión` : 'Tirada inicial'}</strong>
              </div>
              <button type="button" className="secondary-btn" onClick={rerollStats}>
                🎲 Tirar dados
              </button>
            </div>
            {CHRONICLES_MM3_STATS.map((key) => {
              const value = Number(activeCharacter.stats?.[key] || 0);
              const bonus = derived.bonuses[key];
              return (
                <div className="chronicles-character-setup__attribute" key={key} data-stat={key}>
                  <span>
                    <b>{CHRONICLES_MM3_STAT_LABELS[key]}</b>
                    <small>{CHRONICLES_MM3_STAT_EFFECTS[key]}</small>
                  </span>
                  <div>
                    <strong>{value}</strong>
                    <em className={bonus > 0 ? 'is-up' : bonus < 0 ? 'is-down' : ''}>{signed(bonus)}</em>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="chronicles-character-setup__classes" aria-label={`Clase de ${activeCharacter.name}`}>
            <div className="chronicles-character-setup__section-head">
              <div>
                <span>CLASE</span>
                <strong>Sólo las que permite la tirada.</strong>
              </div>
            </div>
            <div className="chronicles-character-setup__class-grid">
              {CHRONICLES_MM3_CLASS_IDS.map((classId) => {
                const definition = CHRONICLES_MM3_CLASSES[classId];
                const unmet = chroniclesMM3UnmetRequirements(classId, activeCharacter.stats);
                const selected = activeCharacter.classId === classId;
                return (
                  <button
                    type="button"
                    key={classId}
                    data-class-id={classId}
                    className={selected ? 'is-selected' : ''}
                    aria-pressed={selected}
                    disabled={unmet.length > 0}
                    onClick={() => chooseClass(classId)}
                  >
                    <strong>{definition.label}</strong>
                    <small>{definition.summary}</small>
                    <em>{unmet.length ? `Necesita ${requirementText(classId)}` : `Vida base ${definition.hpBase} · ${requirementText(classId)}`}</em>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {validation.errors.length ? (
          <div className="chronicles-character-setup__errors" role="alert">
            {validation.errors[0]}
          </div>
        ) : null}

        <footer className="chronicles-character-setup__footer">
          <details className="chronicles-character-setup__mechanics" open>
            <summary>Resumen de la compañía</summary>
            <div>
              {draft.characters.map((character) => {
                const sheet = chroniclesMM3Derived(character.classId, character.stats);
                return (
                  <span key={character.slotId}>
                    <strong>{character.name} · {sheet.classLabel}</strong>
                    <small>Vida {sheet.maxHp} · Armadura {sheet.armorClass} · Acierto {signed(sheet.toHit)} · Daño {signed(sheet.damageBonus)}</small>
                  </span>
                );
              })}
            </div>
          </details>
          <button
            type="button"
            className="primary-btn"
            disabled={!validation.valid}
            onClick={() => confirmBuild(draft)}
          >
            Confirmar compañía
          </button>
        </footer>
      </section>
    </div>
  );
}
