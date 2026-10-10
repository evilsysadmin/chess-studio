import React from 'react';
import intro from '../chronicles/campaign/intro.json';
import { chroniclesQuestEntries } from '../chronicles/chroniclesContentRuntime.js';

// The main storyline is the authored «El rey desaparecido» thread; every
// other quest a region hands out is a side contract.
const MAIN_QUEST_IDS = new Set([intro.questId]);

export function chroniclesQuestLogEntries(state) {
  const quests = chroniclesQuestEntries(state);
  const rank = (quest) => (quest.status === 'active' ? 0 : 1);
  return quests
    .map((quest) => ({ ...quest, main: MAIN_QUEST_IDS.has(quest.id) }))
    .sort((left, right) => rank(left) - rank(right)
      || Number(right.main) - Number(left.main)
      || Number(left.order || 0) - Number(right.order || 0));
}

export default function ChroniclesQuestLog({ state }) {
  const quests = chroniclesQuestLogEntries(state);
  if (!quests.length) return null;
  return (
    <section className="chronicles-quest-log" aria-label="Encargos">
      <h3>Encargos</h3>
      <ul>
        {quests.map((quest) => (
          <li
            key={quest.id}
            className={`chronicles-quest-log__quest is-${quest.status}${quest.main ? ' is-main' : ''}`}
            data-chronicles-quest-id={quest.id}
            data-chronicles-quest-status={quest.status}
          >
            <span aria-hidden="true">{quest.status === 'completed' ? '✓' : quest.main ? '♛' : '◆'}</span>
            <div>
              <small>{quest.main ? 'Historia' : 'Encargo secundario'}{quest.status === 'completed' ? ' · completado' : ''}</small>
              <strong>{quest.title}</strong>
              {quest.objective && <p>{quest.objective}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
