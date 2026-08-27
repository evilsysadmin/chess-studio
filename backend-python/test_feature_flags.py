from feature_flags import PUBLIC_FEATURE_DEFAULTS, public_feature_flags


def test_public_feature_flags_default_to_enabled():
    assert public_feature_flags("") == PUBLIC_FEATURE_DEFAULTS


def test_public_feature_flags_disable_only_known_public_capabilities():
    flags = public_feature_flags(" spectator, postgamefeedback, made-up ")
    assert flags["spectator"] is False
    assert flags["postGameFeedback"] is False
    assert flags["rivalGhost"] is True
    assert "made-up" not in flags
