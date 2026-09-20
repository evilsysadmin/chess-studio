import { useMemo, useState } from 'react';
import { CHRONICLES_PARTY } from '../chroniclesOfMatthias.js';
import {
  CHRONICLES_CREATOR_ATTRIBUTE_BUDGET,
  CHRONICLES_CREATOR_ATTRIBUTE_CAP,
  CHRONICLES_CREATOR_RULES,
  createCanonicalChroniclesCharacterBuild,
  normalizeChroniclesCharacterBuild,
  validateChroniclesCharacterBuild,
} from '../chronicles/chroniclesCharacterBuilds.js';
import './ChroniclesCharacterSetup.css';

const ATTRIBUTE_LABELS = Object.freeze({
  vigor: 'Vigor',
  power: 'Potencia',
  precision: 'Precisión',
  will: 'Voluntad',
});

function customFrom(build) {
  const normalized = normalizeChroniclesCharacterBuild(build, CHRONICLES_PARTY);
  return {
    ...normalized,
    mode: 'custom',
    characters: normalized.characters.map((character) => ({
      ...character,
      attributes: { ...character.attributes },
    })),
  };
}

function pointsSpent(character) {
  return Object.values(character?.attributes || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

export default function ChroniclesCharacterSetup({
  currentBuild,
  onConfirm,
  onExit,
}) {
  const normalizedCurrent = useMemo(
    () => normalizeChroniclesCharacterBuild(currentBuild, CHRONICLES_PARTY),
    [currentBuild],
  );
  const [editing, setEditing] = useState(false);
  const [activeSlot, setActiveSlot] = useState('matthias');
  const [draft, setDraft] = useState(() => customFrom(normalizedCurrent));

  const activeCharacter = draft.characters.find((character) => character.slotId === activeSlot) || draft.characters[0];
  const rules = CHRONICLES_CREATOR_RULES[activeCharacter.slotId];
  const spent = pointsSpent(activeCharacter);
  const remaining = CHRONICLES_CREATOR_ATTRIBUTE_BUDGET - spent;
  const validation = validateChroniclesCharacterBuild(draft);

  const beginCustom = () => {
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

  const setAttribute = (key, delta) => {
    setDraft((current) => ({
      ...current,
      mode: 'custom',
      characters: current.characters.map((character) => {
        if (character.slotId !== activeCharacter.slotId) return character;
        const currentValue = Number(character.attributes?.[key] || 0);
        const currentSpent = pointsSpent(character);
        if (delta > 0 && (currentSpent >= CHRONICLES_CREATOR_ATTRIBUTE_BUDGET || currentValue >= CHRONICLES_CREATOR_ATTRIBUTE_CAP)) {
          return character;
        }
        const nextValue = Math.max(0, Math.min(CHRONICLES_CREATOR_ATTRIBUTE_CAP, currentValue + delta));
        return {
          ...character,
          attributes: { ...character.attributes, [key]: nextValue },
        };
      }),
    }));
  };

  if (!editing) {
    const hasCustom = normalizedCurrent.mode === 'custom';
    return (
      <div className="chronicles-character-setup" data-chronicles-character-setup="choice">
        <section className="chronicles-character-setup__panel" aria-labelledby="chronicles-character-setup-title">
          <span className="section-label">FORMAR COMPAÑÍA</span>
          <h2 id="chronicles-character-setup-title">¿Con quién bajamos ahí?</h2>
          <p>
            Puedes entrar con Matthias, Hildegard, Aziz y Faust tal como vienen de fábrica,
            o crear tu propia compañía sobre los cuatro arquetipos de ajedrez.
          </p>

          {hasCustom ? (
            <div className="chronicles-character-setup__saved" data-testid="chronicles-custom-party-summary">
              <span>COMPAÑÍA GUARDADA</span>
              <strong>{normalizedCurrent.characters.map((character) => character.name).join(' · ')}</strong>
            </div>
          ) : null}

          <div className="chronicles-character-setup__actions">
            {hasCustom ? (
              <button type="button" className="primary-btn" onClick={() => onConfirm(normalizedCurrent)}>
                Continuar con mi compañía
              </button>
            ) : (
              <button
                type="button"
                className="primary-btn"
                onClick={() => onConfirm(createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY))}
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
                onClick={() => onConfirm(createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY))}
              >
                Volver al grupo canónico
              </button>
            ) : null}
            <button type="button" className="ghost-btn" onClick={onExit}>← Salir</button>
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
            <span className="section-label">CREADOR DE PJS · BUILD V1</span>
            <h2>Forma la compañía</h2>
            <p>Un PJ cada vez. Tres puntos de atributo, una skill inicial opcional y nada de numeritos decorativos.</p>
          </div>
          <button type="button" className="ghost-btn" onClick={() => setEditing(false)}>← Volver</button>
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
              <span>{index + 1}</span>
              <strong>{character.name}</strong>
            </button>
          ))}
        </nav>

        <div className="chronicles-character-setup__sheet">
          <div className="chronicles-character-setup__identity">
            <span>{rules.classLabel}</span>
            <label>
              Nombre
              <input
                aria-label={`Nombre de ${activeCharacter.slotId}`}
                value={activeCharacter.name}
                maxLength={24}
                onChange={(event) => patchCharacter(activeCharacter.slotId, { name: event.target.value })}
              />
            </label>
          </div>

          <section className="chronicles-character-setup__attributes" aria-label={`Atributos de ${activeCharacter.name}`}>
            <div className="chronicles-character-setup__section-head">
              <div>
                <span>ATRIBUTOS</span>
                <strong>{remaining} puntos disponibles</strong>
              </div>
              <small>Máximo {CHRONICLES_CREATOR_ATTRIBUTE_CAP} por atributo en creación.</small>
            </div>
            {rules.allowedAttributes.map((key) => {
              const value = Number(activeCharacter.attributes?.[key] || 0);
              return (
                <div className="chronicles-character-setup__attribute" key={key}>
                  <span>{ATTRIBUTE_LABELS[key]}</span>
                  <div>
                    <button
                      type="button"
                      aria-label={`Bajar ${ATTRIBUTE_LABELS[key]}`}
                      onClick={() => setAttribute(key, -1)}
                      disabled={value <= 0}
                    >−</button>
                    <strong>{value}</strong>
                    <button
                      type="button"
                      aria-label={`Subir ${ATTRIBUTE_LABELS[key]}`}
                      onClick={() => setAttribute(key, 1)}
                      disabled={remaining <= 0 || value >= CHRONICLES_CREATOR_ATTRIBUTE_CAP}
                    >+</button>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="chronicles-character-setup__skills">
            <div className="chronicles-character-setup__section-head">
              <div>
                <span>SKILL INICIAL</span>
                <strong>Una ventaja real, no confeti.</strong>
              </div>
            </div>
            <button
              type="button"
              className={!activeCharacter.startingSkillId ? 'is-selected' : ''}
              onClick={() => patchCharacter(activeCharacter.slotId, { startingSkillId: null })}
              aria-pressed={!activeCharacter.startingSkillId}
            >
              <strong>Sin skill inicial</strong>
              <small>Build limpia; toda la progresión vendrá de la expedición.</small>
            </button>
            {rules.startingSkills.map((skill) => (
              <button
                type="button"
                key={skill.id}
                className={activeCharacter.startingSkillId === skill.id ? 'is-selected' : ''}
                onClick={() => patchCharacter(activeCharacter.slotId, { startingSkillId: skill.id })}
                aria-pressed={activeCharacter.startingSkillId === skill.id}
              >
                <strong>{skill.label}</strong>
                <small>{skill.description}</small>
              </button>
            ))}
          </section>
        </div>

        {validation.errors.length ? (
          <div className="chronicles-character-setup__errors" role="alert">
            {validation.errors[0]}
          </div>
        ) : null}

        <footer className="chronicles-character-setup__footer">
          <span>{draft.characters.map((character) => character.name).join(' · ')}</span>
          <button
            type="button"
            className="primary-btn"
            disabled={!validation.valid}
            onClick={() => onConfirm(draft)}
          >
            Confirmar compañía
          </button>
        </footer>
      </section>
    </div>
  );
}
