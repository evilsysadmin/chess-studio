// MM3 mage guilds: «gain membership to a guild and learn what you can».
// An authored interactable with `guild: { membership, spells }` opens a
// counter like a shop. The company pays the membership once per guild, then
// buys each spell per character, only for casters of a matching school.
// Validated against the guild entry at the party's cell, like shops.
import {
  CHRONICLES_GOLD_ITEM_ID,
  chroniclesApplyContentEffects,
  chroniclesGoldBalance,
} from './chroniclesContentRuntime.js';
import { chroniclesTownCounterInReach } from './chroniclesTownCounterReach.js';
import {
  CHRONICLES_SPELLS,
  chroniclesLearnSpell,
  chroniclesMemberKnowsSpell,
  chroniclesSpellAvailableTo,
} from './chroniclesMagic.js';

function guildEntry(state, map, guildId) {
  const entry = (map?.interactables || []).find((item) => item.id === guildId && item.guild);
  if (!entry || !chroniclesTownCounterInReach(state, entry, map)) return null;
  return entry;
}

export function chroniclesGuildSpells(entry) {
  return (entry?.guild?.spells || []).map((id) => CHRONICLES_SPELLS[id]).filter(Boolean);
}

export function chroniclesGuildMember(state, guildId) {
  return state?.guildMemberships?.[guildId] === true;
}

export function chroniclesGuildCanLearn(state, member, spellId) {
  return member.hp > 0
    && chroniclesSpellAvailableTo(member, spellId)
    && !chroniclesMemberKnowsSpell(state, member, spellId);
}

export function chroniclesOpenGuild(state, entry) {
  return {
    ...state,
    guild: { id: entry.id },
    message: chroniclesGuildMember(state, entry.id)
      ? (entry.guild.memberGreeting || entry.action?.message || `${entry.label}.`)
      : (entry.guild.greeting || entry.action?.message || `${entry.label}.`),
  };
}

export function chroniclesCloseGuild(state) {
  if (!state?.guild) return state;
  const { guild: _closed, ...rest } = state;
  return rest;
}

function pay(state, amount) {
  if (amount <= 0) return state;
  return chroniclesApplyContentEffects(state, [{
    type: 'consume-item', itemId: CHRONICLES_GOLD_ITEM_ID, quantity: amount,
  }]);
}

export function chroniclesGuildJoin(state, map) {
  const entry = state?.guild ? guildEntry(state, map, state.guild.id) : null;
  if (!entry || chroniclesGuildMember(state, entry.id)) return state;
  const fee = Math.max(0, Number(entry.guild.membership || 0));
  if (chroniclesGoldBalance(state) < fee) {
    return { ...state, message: `La membresía cuesta ${fee} oro. La bolsa no llega.` };
  }
  const paid = pay(state, fee);
  if (fee > 0 && paid === state) return state;
  return {
    ...paid,
    guildMemberships: { ...paid.guildMemberships, [entry.id]: true },
    message: `La compañía firma en el registro del gremio por ${fee} oro. Las estanterías se abren.`,
  };
}

export function chroniclesGuildLearn(state, map, memberId, spellId) {
  const entry = state?.guild ? guildEntry(state, map, state.guild.id) : null;
  if (!entry || !chroniclesGuildMember(state, entry.id) || !entry.guild.spells?.includes(spellId)) return state;
  const member = state.party.find((candidate) => candidate.id === memberId);
  const definition = CHRONICLES_SPELLS[spellId];
  if (!member || !definition || !chroniclesGuildCanLearn(state, member, spellId)) return state;
  if (chroniclesGoldBalance(state) < definition.price) {
    return { ...state, message: `${definition.name} cuesta ${definition.price} oro. La bolsa no llega.` };
  }
  const paid = pay(state, definition.price);
  if (paid === state) return state;
  return {
    ...chroniclesLearnSpell(paid, memberId, spellId),
    message: `${member.name} copia ${definition.name} en su libro de hechizos por ${definition.price} oro.`,
  };
}
