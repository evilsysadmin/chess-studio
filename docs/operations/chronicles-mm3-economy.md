# Chronicles — MM3 RPG statistics and economy migration

This contract supports [Chronicles open-world RPG epic](https://github.com/evilsysadmin/chess-studio/issues/5324). It is deliberately incremental. **The seven new statistics and resistances are not yet combat-active.** No character sheet may claim a new attribute/resistance affects mechanics until that modifier is wired to the authoritative combat/spell implementation.

## MM3 canonical stats

Might (Fuerza), Intellect (Intelecto), Personality (Personalidad), Endurance (Resistencia), Speed (Velocidad), Accuracy (Precisión) and Luck (Suerte). MM3 secondary stats: HP, SP, AC, level, XP, condition and six resistances: fire, cold, electricity, poison/acid, energy and magic. Equipment can modify core/derived stats when equipped; an item in the shared bag grants **no** combat benefit until an equipped instance and slot are authoritative.

MM3 references: [original manual](https://www.gamesdatabase.org/Media/SYSTEM/Commodore_Amiga/Manual/formated/Might_and_Magic_III-_Isles_of_Terra-_1992_-_New_World_Computing.htm) and [character reference](https://rpg.o2h.pl/mm3/en/character.html).

## Preserve existing players

The current canonical profile uses `chess-study-chronicles-progression-v1` with level, XP, points, class skills and five **bonus** attributes: `vigor`, `power`, `precision`, `will`, `agility`. Do not rename in-place or silently reinterpret old saves.

- MM3 read-only projection (implemented in `chroniclesMM3Stats.js`): neutral base 10; `power → might`, `vigor → endurance`, `precision → accuracy`, `agility → speed` once. `will` remains with legacy ability modifiers; **do not** arbitrarily split into intellect/personality. The projection is NOT yet a source of authority for gameplay.
- Explicit v2 stats must override the legacy projection rather than stack on it. Future profile schema must include a migration ledger/version, retain preexisting points and learned skills, and be reversible via read-only fallback.
- `Speed` is the user-facing MM3 stat, replacing the meaning of `Agility`. Until the actual initiative migration, underlying `agility` and `initiativeBonus` remain **one** functional authority: keep the existing `+ 1d8` variation, not MM3 deterministic first-mover. Do not simultaneously apply Speed and Agility bonuses.
- Extend build/level/spending only together with class-sensitive mechanics and tests: Intellect for arcane SP, Personality for divine SP, Endurance for HP, Might for physical damage, Accuracy for physical hit chance, Speed for AC/initiative, Luck for saves/traps.
- Attribute allocation and point caps in legacy v1 must not be changed retroactively; implement explicit v2 spending before making the new seven trainable.

## Economy & equipment ownership

Gold belongs to a run/campaign as a party wallet, not a particular portrait or a decorative item; choose an explicit versioned checkpoint field before making it permanent. Existing inventory item exchange is a transitional primitive only. Implement atomic gold/payment + item/equipment delivery and server CAS/idempotent shop ledgers (same purchase cannot be claimed twice on F5/retry). Gold sinks must matter: equipment, inns/rest, training and spells. Do not multiply currency across repeated checkpoints.

Persist equipped slot ownership explicitly per hero and define class restrictions. Calculate effective stats from base + trained + equipped modifiers **once**, both in combat and in the character sheet. Do not invent resistance/hit/AC effects based on inventory merely containing objects. Keep narrative inventory and gold money separate in the eventual typed schema.

## Acceptance

Tests must cover v1/v2 projections without double counting, exact seven stats, status effects and correct per-class spell rules when activated; F5, remote restore, old saves and concurrency 409 for all wallet/equipment writes; no visual placeholders. Integration into Swordhaven requires authored map manifests and all three runtime mirrors + Go/Python parity checks and reviewed mobile/desktop screenshots.
