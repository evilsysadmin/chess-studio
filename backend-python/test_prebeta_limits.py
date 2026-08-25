from pathlib import Path

from api_models import AnalyzeRequest, MoveRequest, NewGameRequest
from pydantic import ValidationError
import pytest


def test_expensive_payload_fields_have_bounded_lengths():
    with pytest.raises(ValidationError):
        AnalyzeRequest(fen="x" * 129)
    with pytest.raises(ValidationError):
        NewGameRequest(startingFen="x" * 129)
    with pytest.raises(ValidationError):
        MoveRequest(**{"from": "a2-extra", "to": "a4"})


def test_profile_and_presence_routes_keep_explicit_rate_limits():
    source = Path(__file__).with_name('main.py').read_text(encoding='utf-8')
    assert '@limiter.limit("30/minute")\nasync def activity_heartbeat' in source
    assert '@limiter.limit("60/minute")\nasync def get_profile' in source
    assert '@limiter.limit("20/minute")\nasync def save_profile' in source
    assert '@limiter.limit("60/minute")\nasync def patch_profile' in source
    assert 'PATCH de perfil demasiado grande.' in source
