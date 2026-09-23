import asyncio

import httpx

import ip_geolocation


def test_network_location_status_distinguishes_unusable_addresses():
    assert ip_geolocation.network_location_status(None) == "missing"
    assert ip_geolocation.network_location_status("not-an-ip") == "invalid"
    assert ip_geolocation.network_location_status("192.168.1.25") == "private"
    assert ip_geolocation.network_location_status("8.8.8.8") == "public"


def test_resolver_skips_private_addresses_without_network_request():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"success": True, "country_code": "ES"})

    async def run():
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            return await ip_geolocation.resolve_country_code("10.0.0.8", client=client)

    assert asyncio.run(run()) is None
    assert calls == []


def test_resolver_keeps_only_a_valid_country_code_and_caches_it():
    ip_geolocation._CACHE.clear()
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(200, json={"success": True, "country_code": "us", "city": "ignored"})

    async def run():
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            first = await ip_geolocation.resolve_country_code("8.8.8.8", client=client)
            second = await ip_geolocation.resolve_country_code("8.8.8.8", client=client)
            return first, second

    assert asyncio.run(run()) == ("US", "US")
    assert calls == ["https://ipwho.is/8.8.8.8"]


def test_cached_country_code_returns_only_fresh_public_results():
    ip_geolocation._CACHE.clear()
    ip_geolocation._CACHE["8.8.8.8"] = (float("inf"), "ES")
    assert ip_geolocation.cached_country_code("8.8.8.8") == "ES"
    assert ip_geolocation.cached_country_code("10.0.0.1") is None


def test_background_country_resolution_is_deduplicated_and_non_blocking(monkeypatch):
    ip_geolocation._CACHE.clear()
    ip_geolocation._PENDING.clear()
    ip_geolocation._BACKGROUND_TASKS.clear()
    calls = []

    async def fake_resolve(ip, **_kwargs):
        calls.append(ip)
        await asyncio.sleep(0)
        ip_geolocation._CACHE[ip] = (float("inf"), "ES")
        return "ES"

    monkeypatch.setattr(ip_geolocation, "resolve_country_code", fake_resolve)

    async def run():
        assert ip_geolocation.schedule_country_resolution("8.8.8.8") is True
        assert ip_geolocation.schedule_country_resolution("8.8.8.8") is False
        await asyncio.gather(*list(ip_geolocation._BACKGROUND_TASKS))
        assert ip_geolocation.cached_country_code("8.8.8.8") == "ES"

    asyncio.run(run())
    assert calls == ["8.8.8.8"]
