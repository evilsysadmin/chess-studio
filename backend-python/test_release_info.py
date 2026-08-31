import release_info


def _clear_identity_env(monkeypatch):
    for key in release_info._COMMIT_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def test_backend_release_matches_packaged_release():
    assert release_info.backend_release() == release_info.APP_RELEASE


def test_build_commit_returns_none_without_provider_metadata(monkeypatch):
    _clear_identity_env(monkeypatch)
    assert release_info.build_commit() is None


def test_build_commit_prefers_render_commit(monkeypatch):
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("GITHUB_SHA", "github-fallback")
    monkeypatch.setenv("RENDER_GIT_COMMIT", "abc123def456")
    assert release_info.build_commit() == "abc123def456"


def test_deployment_identity_falls_back_to_release(monkeypatch):
    _clear_identity_env(monkeypatch)
    assert release_info.deployment_identity() == f"release:{release_info.APP_RELEASE}"


def test_deployment_identity_prefers_render_commit(monkeypatch):
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("GITHUB_SHA", "github-fallback")
    monkeypatch.setenv("RENDER_GIT_COMMIT", "abc123def456")
    assert release_info.deployment_identity() == "git:abc123def456"


def test_deployment_identity_normalizes_provider_metadata(monkeypatch):
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("RENDER_GIT_COMMIT", "  commit with spaces / weird  ")
    assert release_info.deployment_identity() == "git:commit-with-spaces-weird"
