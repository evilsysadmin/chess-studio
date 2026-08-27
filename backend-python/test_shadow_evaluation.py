import shadow_evaluation as shadow


def setup_function():
    shadow.reset_shadow_metrics()


def test_shadow_is_off_by_default(monkeypatch):
    monkeypatch.delenv("SHADOW_EVAL_PERCENT", raising=False)
    assert shadow.shadow_enabled() is False
    assert shadow.should_sample(0.0) is False


def test_shadow_sampling_is_bounded(monkeypatch):
    monkeypatch.setenv("SHADOW_EVAL_PERCENT", "5")
    assert shadow.should_sample(0.049) is True
    assert shadow.should_sample(0.05) is False
    monkeypatch.setenv("SHADOW_EVAL_PERCENT", "500")
    assert shadow.get_shadow_metrics()["sample_percent"] == 25.0
