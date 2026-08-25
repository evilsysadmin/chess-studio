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
