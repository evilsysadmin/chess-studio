from chronicles_map_code import ChroniclesMapCode
from chronicles_map_planner import (
    CHRONICLES_PLANNER_CONTRACT_VERSION,
    resolve_chronicles_planner_recipe,
)


def _base_recipe():
    return ChroniclesMapCode(
        theme="water",
        width=13,
        height=10,
        verbs=("sluice", "guardian"),
        enemies=4,
        treasures=2,
        secrets=1,
        difficulty=3,
        seed=417,
    )


def test_planner_absence_is_non_fatal_local_fallback():
    base = _base_recipe()
    decision = resolve_chronicles_planner_recipe(base)

    assert decision.recipe == base
    assert decision.accepted is False
    assert decision.source is None
    assert decision.proposal_revision is None
    assert decision.reason == "no-proposal"


def test_planner_can_change_only_topology_intent_and_revision_is_canonical():
    base = _base_recipe()
    proposal = {
        "version": CHRONICLES_PLANNER_CONTRACT_VERSION,
        "source": "workers-ai",
        "verbs": ["traps", "guardian"],
        "difficulty": 5,
    }
    reordered = {
        "difficulty": 5,
        "verbs": ["traps", "guardian"],
        "source": "workers-ai",
        "version": CHRONICLES_PLANNER_CONTRACT_VERSION,
    }

    decision = resolve_chronicles_planner_recipe(base, proposal)
    repeated = resolve_chronicles_planner_recipe(base, reordered)

    assert decision.accepted is True
    assert decision.reason == "accepted"
    assert decision.source == "workers-ai"
    assert len(decision.proposal_revision) == 64
    assert decision.proposal_revision == repeated.proposal_revision
    assert decision.recipe.verbs == ("traps", "guardian")
    assert decision.recipe.difficulty == 5

    # Authoritative run identity/content facts are locked in contract v1.
    assert decision.recipe.seed == base.seed
    assert decision.recipe.size == base.size
    assert decision.recipe.theme == base.theme
    assert decision.recipe.enemies == base.enemies
    assert decision.recipe.treasures == base.treasures
    assert decision.recipe.secrets == base.secrets


def test_planner_rejects_authoritative_field_overrides_and_falls_back():
    base = _base_recipe()

    for forbidden in (
        {"seed": 99},
        {"theme": "crypt"},
        {"width": 19},
        {"enemies": 8},
    ):
        proposal = {
            "version": CHRONICLES_PLANNER_CONTRACT_VERSION,
            "source": "workers-ai",
            "difficulty": 4,
            **forbidden,
        }
        decision = resolve_chronicles_planner_recipe(base, proposal)

        assert decision.recipe == base
        assert decision.accepted is False
        assert decision.reason == "invalid-proposal"
        assert decision.source is None
        assert decision.proposal_revision is None


def test_planner_rejects_malformed_values_without_blocking_run():
    base = _base_recipe()
    proposals = (
        {"version": 2, "source": "workers-ai", "difficulty": 4},
        {"version": 1, "source": "workers ai", "difficulty": 4},
        {"version": 1, "source": "workers-ai", "difficulty": True},
        {"version": 1, "source": "workers-ai", "difficulty": 99},
        {"version": 1, "source": "workers-ai", "verbs": []},
        {"version": 1, "source": "workers-ai", "verbs": ["invent-quest"]},
        {"version": 1, "source": "workers-ai"},
        "not-an-object",
    )

    for proposal in proposals:
        decision = resolve_chronicles_planner_recipe(base, proposal)
        assert decision.recipe == base
        assert decision.accepted is False
        assert decision.reason == "invalid-proposal"


def test_planner_noop_is_recordable_but_does_not_claim_influence():
    base = _base_recipe()
    decision = resolve_chronicles_planner_recipe(
        base,
        {
            "version": CHRONICLES_PLANNER_CONTRACT_VERSION,
            "source": "workers-ai",
            "verbs": list(base.verbs),
            "difficulty": base.difficulty,
        },
    )

    assert decision.recipe == base
    assert decision.accepted is False
    assert decision.reason == "no-change"
    assert decision.source == "workers-ai"
    assert len(decision.proposal_revision) == 64


def test_procedural_manifest_records_accepted_planner_provenance():
    import chronicles_api
    from chronicles_manifest_procedural import proceduralize_chronicles_manifest
    from chronicles_map_code import parse_chronicles_map_code

    base, _revision = chronicles_api.load_chronicles_manifest("echo-cistern")
    local = proceduralize_chronicles_manifest(base, 417)
    planned = proceduralize_chronicles_manifest(
        base,
        417,
        planner_proposal={
            "version": CHRONICLES_PLANNER_CONTRACT_VERSION,
            "source": "workers-ai",
            "verbs": ["traps", "guardian"],
            "difficulty": 5,
        },
    )

    local_recipe = parse_chronicles_map_code(local.map_code)
    planned_recipe = parse_chronicles_map_code(planned.map_code)
    generation = planned.manifest["generation"]

    assert planned.map_code != local.map_code
    assert planned_recipe.seed == local_recipe.seed == 417
    assert planned_recipe.size == local_recipe.size
    assert planned_recipe.theme == local_recipe.theme
    assert planned_recipe.enemies == local_recipe.enemies
    assert planned_recipe.treasures == local_recipe.treasures
    assert planned_recipe.secrets == local_recipe.secrets
    assert planned_recipe.verbs == ("traps", "guardian")
    assert planned_recipe.difficulty == 5
    assert generation["plannerContractVersion"] == CHRONICLES_PLANNER_CONTRACT_VERSION
    assert generation["plannerAccepted"] is True
    assert generation["plannerSource"] == "workers-ai"
    assert len(generation["plannerProposalRevision"]) == 64
    assert generation["plannerReason"] == "accepted"


def test_invalid_planner_proposal_preserves_local_deterministic_result():
    import chronicles_api
    from chronicles_manifest_procedural import proceduralize_chronicles_manifest

    base, _revision = chronicles_api.load_chronicles_manifest("echo-cistern")
    local = proceduralize_chronicles_manifest(base, 99)
    rejected = proceduralize_chronicles_manifest(
        base,
        99,
        planner_proposal={
            "version": CHRONICLES_PLANNER_CONTRACT_VERSION,
            "source": "workers-ai",
            "difficulty": 4,
            "seed": 12345,
        },
    )

    generation = rejected.manifest["generation"]
    assert rejected.map_code == local.map_code
    assert rejected.manifest["grid"] == local.manifest["grid"]
    assert rejected.layout_revision == local.layout_revision
    assert generation["plannerAccepted"] is False
    assert generation["plannerSource"] is None
    assert generation["plannerProposalRevision"] is None
    assert generation["plannerReason"] == "invalid-proposal"
