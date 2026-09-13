from curated_puzzle_quality import load_curated_puzzles, validate_curated_catalog


def test_curated_catalog_has_unique_named_positions():
    puzzles = load_curated_puzzles()
    assert len(puzzles) == 26
    assert len({puzzle["id"] for puzzle in puzzles}) == len(puzzles)


def test_curated_catalog_survives_shared_minimax_validation():
    issues = validate_curated_catalog()
    assert not issues, "Curated puzzle quality failures:\n" + "\n".join(str(issue) for issue in issues)
