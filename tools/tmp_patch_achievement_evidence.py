from pathlib import Path

# GameScreen: noteworthy incidents already know the current real game context.
path = Path('frontend/src/components/GameScreen.jsx')
text = path.read_text()
old = "    const [unlocked] = recordNoteworthyAchievement(comment.event, actor);"
new = """    const [unlocked] = recordNoteworthyAchievement(comment.event, actor, {
      gameId: game.id,
      difficulty: game.difficulty,
      color: humanColor,
      opening,
      ply,
    });"""
if old not in text:
    raise SystemExit('GameScreen noteworthy achievement anchor not found')
text = text.replace(old, new, 1)
path.write_text(text)

# Combat: the battle record has already been persisted before this gate runs.
path = Path('frontend/src/components/useCombatController.js')
text = path.read_text()
old = "    checkAchievements({ combatFlawlessWin: isWin && survivorCount === 16 });"
new = """    const combatFlawlessWin = isWin && survivorCount === 16;
    checkAchievements({
      combatFlawlessWin,
      achievementEvidence: combatFlawlessWin
        ? {
            combat_flawless: {
              source: 'combat-battle',
              battleId: battleRecord.id,
              occurredAt: battleRecord.date,
              difficulty: battleRecord.difficulty,
              color: battleRecord.humanColor,
              mode: battleRecord.variant,
            },
          }
        : {},
    });"""
if old not in text:
    raise SystemExit('Combat flawless achievement anchor not found')
text = text.replace(old, new, 1)
path.write_text(text)

# Add a regression that proves checkAchievements carries real battle provenance.
path = Path('frontend/src/achievements.test.js')
text = path.read_text()
anchor = """  it('el evento puntual \"victoria perfecta\" se puede desbloquear vía extra', () => {
    const { unlocked } = checkAchievements({ combatFlawlessWin: true });
    expect(unlocked.has('combat_flawless')).toBe(true);
  });
"""
insert = anchor + """
  it('acredita victoria perfecta con la batalla real cuando el caller la conoce', () => {
    checkAchievements({
      combatFlawlessWin: true,
      achievementEvidence: {
        combat_flawless: {
          source: 'combat-battle',
          battleId: 'combat-42',
          occurredAt: '2026-09-03T21:30:00.000Z',
          difficulty: 78,
          color: 'b',
          mode: 'roguelike',
        },
      },
    });
    const record = achievementRecord('combat_flawless');
    expect(record?.source).toBe('combat-battle');
    expect(record?.provenance).toEqual({
      battleId: 'combat-42',
      mode: 'roguelike',
      color: 'b',
      difficulty: 78,
      occurredAt: '2026-09-03T21:30:00.000Z',
    });
  });
"""
if anchor not in text:
    raise SystemExit('Achievements combat test anchor not found')
text = text.replace(anchor, insert, 1)
path.write_text(text)
