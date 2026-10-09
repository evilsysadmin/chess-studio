"""A candidate runtime world may never overwrite or mutate legacy Chronicles."""
import json
import pytest

from chronicles_campaign.runtime_manifests import materialize_campaign_maps

def test_swordhaven_road_candidate_has_real_reciprocal_exits():
    maps = materialize_campaign_maps(["swordhaven-square", "banner-road"])
    assert set(maps) == {"swordhaven-campaign", "banner-road"}
    town, road = maps["swordhaven-campaign"], maps["banner-road"]
    assert town["layoutMode"] == road["layoutMode"] == "authored"
    assert town["regionKind"] == "settlement"
    assert road["regionKind"] == "wilderness"
    assert all(set("".join(m["grid"])) <= {"#", "."} for m in maps.values())
    assert town["initialFlags"]["swordhavenArrived"] is True
    assert [e["action"]["effects"][0]["mapId"] for e in town["exits"]] == ["banner-road"]
    assert [e["action"]["effects"][0]["mapId"] for e in road["exits"]] == ["swordhaven-campaign"]
    assert road["exits"][0]["requiresReturn"] is True


def test_campaign_pois_are_idempotent_and_reachable():
    maps = materialize_campaign_maps(["swordhaven-square", "banner-road"])
    assert maps["swordhaven-campaign"]["interactables"]
    assert maps["banner-road"]["interactables"]
    for manifest in maps.values():
        for point in manifest["interactables"]:
            assert point["when"][0]["falsy"] is True
            assert point["action"]["effects"][0] == {
                "type": "set",
                "key": point["when"][0]["key"],
                "value": True,
            }


def test_generator_never_replaces_legacy_dungeons_or_has_hidden_side_effects():
    with pytest.raises(ValueError, match="Legacy dungeon"):
        materialize_campaign_maps(["crypt-eight-squares"])
    with pytest.raises(ValueError, match="does not exist"):
        materialize_campaign_maps(["not-a-map"])
    with pytest.raises(ValueError, match="unique"):
        materialize_campaign_maps(["banner-road", "banner-road"])
    first = materialize_campaign_maps(["banner-road"])
    again = materialize_campaign_maps(["banner-road"])
    assert first == again
