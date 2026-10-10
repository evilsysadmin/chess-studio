# Chronicles — MM3 RPG statistics and economy migration

This contract supports [Chronicles open-world RPG epic](https://github.com/evilsysadmin/chess-studio/issues/5324). It is deliberately incremental. **The seven new statistics and resistances are not yet combat-active.** No character sheet may claim a new attribute/resistance affects mechanics until that modifier is wired to the authoritative combat/spell implementation.

## MM3 canonical stats

Might (Fuerza), Intellect (Intelecto), Personality (Personalidad), Endurance (Resistencia), Speed (Velocidad), Accuracy (Precisión) and Luck (Suerte). MM3 secondary stats: HP, SP, AC, level, XP, condition and six resistances: fire, cold, electricity, poison/acid, energy and magic. Equipment can modify core/derived stats when equipped; an item in the shared bag grants **no** combat benefit until an equipped instance and slot are authoritative.

MM3 references: [original manual](https://www.gamesdatabase.org/Media/SYSTEM/Commodore_Amiga/Manual/formated/Might_and_Magic_III-_Isles_of_Terra-_1992_-_New_World_Computing.htm) and [character reference](https://rpg.o2h.pl/mm3/en/character.html).

## New campaign save contract (decision 2026-10-10)

**Chronicles is a new RPG; existing Chronicles save games do not need to remain loadable.** Breaking the old `vigor/power/precision/will/agility` profile schema, old world IDs, old quest flags, and former run checkpoints is explicitly permitted. Retire compatibility adapters when they block good RPG mechanics. Do not spend implementation time keeping old expeditions alive.

This does **not** allow corrupting Chess Studio profiles outside Chronicles, or leaking Chronicles quest state into Tactics. New campaign saves, once created, must round-trip reliably through F5, multiple devices, CAS retries and identity changes. Reset or migrate only the Chronicles-specific keys and run documents, never unrelated user progress.

- Build the next character model directly from seven real MM3 stats: Might, Intellect, Personality, Endurance, Speed, Accuracy, Luck. The existing read-only projection is transitional scaffolding, not a long-term requirement.
- Speed replaces Agility as the single initiative stat; keep the intentionally chaotic +1d8 roll. Never apply both Speed and legacy Agility in the same roll.
- Wire class-sensitive effective mechanics rather than cosmetic numbers: Intellect/Personality for spell points by class, Endurance for HP, Might for physical damage, Accuracy for hit chance, Speed for AC/initiative, Luck for saving throws and traps.
- New level-up spending, starting stat budgets, and equipment modifiers should be internally consistent; do not preserve deprecated v1 caps or point ledgers solely for old saves.

## Economy & equipment ownership

Gold belongs to a run/campaign as a party wallet, not a particular portrait or a decorative item; choose an explicit versioned checkpoint field before making it permanent. Existing inventory item exchange is a transitional primitive only. Implement atomic gold/payment + item/equipment delivery and server CAS/idempotent shop ledgers (same purchase cannot be claimed twice on F5/retry). Gold sinks must matter: equipment, inns/rest, training and spells. Do not multiply currency across repeated checkpoints.

Persist equipped slot ownership explicitly per hero and define class restrictions. Calculate effective stats from base + trained + equipped modifiers **once**, both in combat and in the character sheet. Do not invent resistance/hit/AC effects based on inventory merely containing objects. Keep narrative inventory and gold money separate in the eventual typed schema.

## Acceptance

Tests must cover exactly seven effective stats, status effects and correct per-class spell rules when activated; F5, remote restore and concurrency 409 for all NEW wallet/equipment writes; no visual placeholders. Integration into Swordhaven requires authored map manifests and all three runtime mirrors + Go/Python parity checks and reviewed mobile/desktop screenshots.
