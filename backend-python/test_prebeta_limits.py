from pathlib import Path

from starlette.requests import Request

from auth import create_token
from main import rate_limit_key
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


def _request(*, token=None, client_host="203.0.113.10"):
    headers = []
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode()))
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/api/profile",
        "headers": headers,
        "client": (client_host, 43210),
        "server": ("testserver", 80),
        "scheme": "http",
        "query_string": b"",
    })


def test_rate_limit_key_uses_account_for_authenticated_requests_and_ip_before_login():
    alice = create_token("alice")
    bob = create_token("bob")

    # Misma NAT, cuentas distintas: no comparten bucket.
    assert rate_limit_key(_request(token=alice)) == "user:alice"
    assert rate_limit_key(_request(token=bob)) == "user:bob"

    # Sin identidad válida, el límite sigue protegiendo login/registro por IP.
    assert rate_limit_key(_request()) == "ip:203.0.113.10"
