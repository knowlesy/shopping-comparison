"""
Sidecar request-boundary tests: probe handler, whole-request deadline, browser ownership.

Nothing here contacts a retailer. Outbound HTTP is replaced by fakes that fail the test
if a real client is constructed, and the browser is replaced by an ownership-sensitive
fake, so the suite is safe to run anywhere including CI.
"""

import os
import sys
import threading
import time

import pytest

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
FETCHER_ROOT = os.path.dirname(CURRENT_DIR)
if FETCHER_ROOT not in sys.path:
    sys.path.insert(0, FETCHER_ROOT)

TEST_TOKEN = "test-fetcher-token-not-a-secret"
os.environ.setdefault("FETCHER_TOKEN", TEST_TOKEN)

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402
from deadline import RequestDeadline  # noqa: E402
from politeness import RateLimiter, StoreCircuitBreaker  # noqa: E402


@pytest.fixture
def client():
    return TestClient(server.app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _no_real_politeness_sleeps(monkeypatch):
    """Keep tests fast without removing the bounding behaviour being tested."""
    monkeypatch.setattr(server.rate_limiter, "get_polite_delay", lambda: 0.0)


# ---------------------------------------------------------------------------
# Condition 1 — the probe handler
# ---------------------------------------------------------------------------

class FakeResponse:
    def __init__(self, status_code=200):
        self.status_code = status_code
        self.text = "<html></html>"


class FakeSession:
    """Stands in for curl_cffi's Session. Records calls; never touches the network."""

    def __init__(self, status_code=200, delay_sec=0.0):
        self.status_code = status_code
        self.delay_sec = delay_sec
        self.calls = []

    def request(self, method, url, headers=None, timeout=None):
        self.calls.append({"method": method, "url": url, "timeout": timeout})
        if self.delay_sec:
            time.sleep(self.delay_sec)
        if isinstance(self.status_code, Exception):
            raise self.status_code
        return FakeResponse(self.status_code)


@pytest.fixture
def fake_probe_session(monkeypatch):
    """Replace curl_cffi inside the probe handler with a session that cannot reach out."""
    session = FakeSession()

    class _FakeCffiRequests:
        @staticmethod
        def Session(**_kwargs):
            return session

    import curl_cffi  # noqa: F401  (present in requirements; we replace its module attr)
    monkeypatch.setattr("curl_cffi.requests", _FakeCffiRequests, raising=False)
    return session


def _fresh_politeness(monkeypatch):
    """Isolate circuit/cap state so one test cannot leak into another."""
    monkeypatch.setattr(server, "circuit_breaker", StoreCircuitBreaker())

    class _AlwaysUnderCap:
        def __init__(self):
            self.calls = []

        def check_and_increment(self, store):
            self.calls.append(store)
            return True

    cap = _AlwaysUnderCap()
    monkeypatch.setattr(server, "daily_request_cap", cap)
    return cap


def test_probe_rejects_missing_and_wrong_token(client):
    assert client.get("/probe").status_code == 401
    assert client.get("/probe", headers={"x-fetcher-token": "wrong"}).status_code == 401
    assert client.get("/probe", headers={"authorization": "Bearer wrong"}).status_code == 401


def test_probe_succeeds_with_mocked_retailer_calls(client, fake_probe_session, monkeypatch):
    """
    Regression: the handler called rate_limiter.wait(), which does not exist on
    RateLimiter, so every authenticated probe returned HTTP 500 before reaching a store.
    """
    assert not hasattr(RateLimiter, "wait"), (
        "RateLimiter has no wait(); if one is added, the probe's use of wait_polite() "
        "should be revisited deliberately rather than silently re-pointed"
    )

    _fresh_politeness(monkeypatch)
    waited = []
    monkeypatch.setattr(
        server.rate_limiter,
        "wait_polite",
        lambda store, max_wait_sec=None: waited.append((store, max_wait_sec)) or 0.0,
    )

    res = client.get("/probe", headers={"x-fetcher-token": TEST_TOKEN})
    assert res.status_code == 200, res.text
    body = res.json()

    for store in ("tesco", "sainsburys", "asda", "morrisons", "iceland"):
        assert body["stores"][store]["status"] == "reachable", body["stores"][store]
    for store in ("aldi", "lidl"):
        assert body["stores"][store]["status"] == "unsupported"

    assert len(fake_probe_session.calls) == 5
    assert [s for s, _ in waited] == ["tesco", "sainsburys", "asda", "morrisons", "iceland"]
    # The politeness wait is bounded by the probe's remaining budget, not unbounded.
    assert all(cap is not None and cap > 0 for _, cap in waited)


def test_probe_reports_circuit_open_without_contacting_store(client, fake_probe_session, monkeypatch):
    _fresh_politeness(monkeypatch)
    breaker = server.circuit_breaker
    for _ in range(breaker.failure_threshold):
        breaker.record_failure("tesco")
    assert breaker.is_available("tesco") is False

    res = client.get("/probe", headers={"x-fetcher-token": TEST_TOKEN})
    assert res.status_code == 200
    body = res.json()
    assert body["stores"]["tesco"]["status"] == "circuit_open"
    assert all(c["url"].find("tesco.com") == -1 for c in fake_probe_session.calls)
    assert len(fake_probe_session.calls) == 4


def test_probe_reports_daily_cap_without_contacting_store(client, fake_probe_session, monkeypatch):
    monkeypatch.setattr(server, "circuit_breaker", StoreCircuitBreaker())

    class _CapExhaustedForAsda:
        def check_and_increment(self, store):
            return store != "asda"

    monkeypatch.setattr(server, "daily_request_cap", _CapExhaustedForAsda())

    res = client.get("/probe", headers={"x-fetcher-token": TEST_TOKEN})
    assert res.status_code == 200
    body = res.json()
    assert body["stores"]["asda"]["status"] == "rate_limited"
    assert all("asda.com" not in c["url"] for c in fake_probe_session.calls)


def test_probe_clamps_each_request_timeout_to_its_budget(client, fake_probe_session, monkeypatch):
    _fresh_politeness(monkeypatch)
    res = client.get("/probe", headers={"x-fetcher-token": TEST_TOKEN})
    assert res.status_code == 200
    for call in fake_probe_session.calls:
        assert call["timeout"] is not None
        assert call["timeout"] <= server.PROBE_PER_STORE_TIMEOUT_SEC
    assert res.json()["deadline"]["budgetMs"] == server.PROBE_DEFAULT_TIMEOUT_MS


# ---------------------------------------------------------------------------
# Condition 2 — bounded aggregate work on /search
# ---------------------------------------------------------------------------

class SlowAdapter:
    """Deterministic adapter that sleeps for a fixed time and records its budget."""

    def __init__(self, store, delay_sec):
        self.store_name = store
        self.delay_sec = delay_sec
        self.calls = []

    @property
    def capabilities(self):
        return {}

    def search(self, query, *, target_quantity=None, want_variants=False, deadline=None):
        self.calls.append({
            "query": query,
            "remaining_at_start": None if deadline is None else deadline.remaining(),
        })
        time.sleep(self.delay_sec)
        return [{"id": f"{self.store_name}-1"}]

    def normalize(self, raw):
        from schema import UnifiedProduct
        return UnifiedProduct(
            id=raw["id"], supermarket=self.store_name, title="stub", price=1.0, source="direct"
        )


STORE_DELAY_SEC = 1.0
SEARCH_BUDGET_MS = 2500


@pytest.fixture
def slow_adapters(monkeypatch):
    """Every supported store answers after a fixed delay, so the arithmetic is exact."""
    _fresh_politeness(monkeypatch)
    adapters = {s: SlowAdapter(s, STORE_DELAY_SEC) for s in server.KNOWN_STORES}
    monkeypatch.setattr(server, "get_adapter", lambda store: adapters.get(store))
    return adapters


def test_search_bounds_aggregate_work_and_reports_skipped_stores(client, slow_adapters):
    """
    Five stores at 1s each need ~5s unbounded. With a 2.5s budget and a 1s minimum useful
    slice, two stores are attempted (2.5 -> 1.5 -> 0.5) and the remaining three are never
    started. The sidecar must report all five and keep the results it already collected.
    """
    started = time.monotonic()
    res = client.post(
        "/search",
        headers={"x-fetcher-token": TEST_TOKEN},
        json={"query": "milk", "stores": server.KNOWN_STORES, "timeoutMs": SEARCH_BUDGET_MS},
    )
    elapsed = time.monotonic() - started

    assert res.status_code == 200, res.text
    body = res.json()

    ok = [s for s, r in body["stores"].items() if r["status"] == "ok"]
    skipped = [s for s, r in body["stores"].items() if r["status"] == "deadline_exceeded"]

    assert len(ok) == 2, f"expected two stores attempted, got {ok}"
    assert len(skipped) == 3, f"expected three stores skipped, got {skipped}"
    assert set(ok) | set(skipped) == set(server.KNOWN_STORES), "every store keeps a status"
    assert ok == server.KNOWN_STORES[:2], "stores are attempted in request order"

    unbounded_sec = STORE_DELAY_SEC * len(server.KNOWN_STORES)
    assert elapsed < unbounded_sec - 1.0, (
        f"aggregate work was not bounded by the budget: took {elapsed:.2f}s, "
        f"unbounded would be ~{unbounded_sec:.1f}s"
    )

    assert body["deadline"]["budgetMs"] == SEARCH_BUDGET_MS
    # Time technically remained, but too little to be worth another store. The response
    # has to say so, or the three skipped stores look unexplained.
    assert body["deadline"]["acceptingNewWork"] is False
    assert body["deadline"]["remainingMs"] < body["deadline"]["minUsefulSliceMs"]

    for store in ok:
        assert body["stores"][store]["products"], "an attempted store returns its products"
    for store in skipped:
        assert body["stores"][store]["products"] == []
        assert slow_adapters[store].calls == [], "a skipped store must never be contacted"


def test_search_without_timeout_uses_server_default(client, slow_adapters):
    res = client.post(
        "/search",
        headers={"x-fetcher-token": TEST_TOKEN},
        json={"query": "milk", "stores": ["tesco"]},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["deadline"]["budgetMs"] == server.SEARCH_DEFAULT_TIMEOUT_MS
    assert body["stores"]["tesco"]["status"] == "ok"


def test_search_caps_a_caller_asking_for_more_than_the_server_allows(client, slow_adapters):
    res = client.post(
        "/search",
        headers={"x-fetcher-token": TEST_TOKEN},
        json={"query": "milk", "stores": ["tesco"], "timeoutMs": 10 * 60 * 1000},
    )
    assert res.status_code == 200
    assert res.json()["deadline"]["budgetMs"] == server.SEARCH_MAX_TIMEOUT_MS


def test_search_passes_shrinking_budget_into_each_adapter(client, slow_adapters):
    res = client.post(
        "/search",
        headers={"x-fetcher-token": TEST_TOKEN},
        json={"query": "milk", "stores": ["tesco", "sainsburys"], "timeoutMs": 5000},
    )
    assert res.status_code == 200
    first = slow_adapters["tesco"].calls[0]["remaining_at_start"]
    second = slow_adapters["sainsburys"].calls[0]["remaining_at_start"]
    assert first is not None and second is not None, "adapters must receive the deadline"
    assert second < first, "each store sees the budget that is actually left"


def test_search_rejects_missing_and_wrong_token(client):
    assert client.post("/search", json={"query": "milk"}).status_code == 401
    assert client.post(
        "/search", headers={"x-fetcher-token": "wrong"}, json={"query": "milk"}
    ).status_code == 401


def test_deadline_clamps_operation_timeouts():
    d = RequestDeadline(2.0)
    assert d.clamp(30.0) <= 2.0
    assert d.clamp(0.5) == pytest.approx(0.5, abs=0.01)
    assert d.clamp_ms(30000) <= 2000

    spent = RequestDeadline(0.0)
    assert spent.expired() is True
    assert spent.has_useful_time() is False
    assert spent.snapshot()["acceptingNewWork"] is False

    # A budget can stop accepting new work while it has not strictly expired.
    nearly = RequestDeadline(0.2)
    assert nearly.expired() is False
    assert nearly.has_useful_time() is False
    snap = nearly.snapshot()
    assert snap["exceeded"] is False and snap["acceptingNewWork"] is False
    # Never hands an HTTP client a zero timeout, which most clients treat as an error.
    assert spent.clamp(30.0) > 0


# ---------------------------------------------------------------------------
# Condition 3 — browser ownership under overlapping requests
# ---------------------------------------------------------------------------

class OwnershipSensitiveFakeBrowser:
    """
    Stands in for a Camoufox/Playwright sync handle, which is bound to the thread that
    created it. Records the thread that created it and refuses use from any other, and
    detects two callers being inside it at once.
    """

    def __init__(self):
        self.created_on = threading.get_ident()
        self.used_by = []
        self.concurrent_uses = 0
        self._in_use = 0
        self._guard = threading.Lock()
        self.pages_opened = 0
        self.pages_closed = 0
        self.fail_next_goto = False
        self.goto_delay_sec = 0.15

    def is_connected(self):
        return True

    def close(self):
        pass

    def new_page(self):
        if threading.get_ident() != self.created_on:
            raise RuntimeError(
                f"sync browser handle created on thread {self.created_on} "
                f"used from thread {threading.get_ident()}"
            )
        self.used_by.append(threading.get_ident())
        with self._guard:
            self._in_use += 1
            if self._in_use > 1:
                self.concurrent_uses += 1
        self.pages_opened += 1
        return _FakePage(self)


class _FakePage:
    def __init__(self, browser):
        self._browser = browser

    def goto(self, url, wait_until=None, timeout=None):
        time.sleep(self._browser.goto_delay_sec)
        if self._browser.fail_next_goto:
            self._browser.fail_next_goto = False
            raise RuntimeError("navigation failed")
        return type("R", (), {"status": 200})()

    def wait_for_selector(self, selector, timeout=None):
        return None

    def wait_for_timeout(self, ms):
        return None

    def title(self):
        return "fake"

    def content(self):
        return "<html></html>"

    def query_selector_all(self, selector):
        return []

    def close(self):
        with self._browser._guard:
            self._browser._in_use -= 1
        self._browser.pages_closed += 1


@pytest.fixture
def owned_browser(monkeypatch):
    from browser import Tier2Browser

    svc = Tier2Browser(headless=True)
    created = {}

    def _fake_ensure():
        svc._assert_owner_thread()
        if "browser" not in created:
            created["browser"] = OwnershipSensitiveFakeBrowser()
        return created["browser"]

    monkeypatch.setattr(svc, "_ensure_browser", _fake_ensure)
    yield svc, created
    svc.shutdown()


def test_overlapping_requests_share_one_browser_owner_thread(owned_browser):
    """
    Two requests arriving on different FastAPI worker threads must not both drive the
    synchronous browser. The fake raises if used from a thread other than its creator.
    """
    svc, created = owned_browser
    results = {}
    errors = []

    def worker(name):
        try:
            results[name] = svc.render_page(f"https://example.invalid/{name}")
        except Exception as e:  # pragma: no cover - surfaced through errors below
            errors.append(e)

    threads = [threading.Thread(target=worker, args=(n,), name=f"fastapi-worker-{n}") for n in ("a", "b")]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert not errors, f"browser was used unsafely across threads: {errors}"
    assert results["a"]["success"] is True
    assert results["b"]["success"] is True

    browser = created["browser"]
    assert len(set(browser.used_by)) == 1, "the browser must only ever be touched by one thread"
    assert browser.used_by[0] == browser.created_on
    assert browser.concurrent_uses == 0, "overlapping renders must queue, not interleave"
    assert threading.get_ident() not in browser.used_by, "work must not run on the caller's thread"


def test_pages_are_closed_after_a_failed_render(owned_browser):
    svc, created = owned_browser

    first = svc.render_page("https://example.invalid/ok")
    assert first["success"] is True

    browser = created["browser"]
    opened_before = browser.pages_opened

    # Fail the next navigation mid-flight; the page must still be closed, or a reused
    # browser leaks a page per failure until the process runs out of them.
    browser.fail_next_goto = True
    failed = svc.render_page("https://example.invalid/fail")

    assert failed["success"] is False
    assert browser.pages_opened == opened_before + 1
    assert browser.pages_closed == browser.pages_opened, "a failed render must still close its page"

    # And the browser is still usable afterwards, rather than left in a broken state.
    after = svc.render_page("https://example.invalid/again")
    assert after["success"] is True


def test_render_page_reports_a_caller_budget_overrun_without_hanging(owned_browser):
    """
    Documented limitation: an overrunning render cannot be cancelled. The caller stops
    waiting and gets an explicit timedOut result; the owner thread finishes the work.
    """
    svc, created = owned_browser
    svc.render_page("https://example.invalid/warmup")  # create the fake browser
    created["browser"].goto_delay_sec = 1.0

    started = time.monotonic()
    res = svc.render_page("https://example.invalid/slow", wait_timeout_ms=50)
    elapsed = time.monotonic() - started

    assert res["success"] is False
    assert res.get("timedOut") is True
    assert elapsed < 1.0, "the caller must stop waiting at its own budget"


# ---------------------------------------------------------------------------
# Condition 4 — no retailer request is made in offline tests
# ---------------------------------------------------------------------------

def test_offline_suite_never_constructs_a_real_retailer_session(client, monkeypatch):
    """
    Belt and braces: if any code path in a /search request reaches curl_cffi for real,
    fail loudly rather than silently making an outbound request from a test run.
    """
    _fresh_politeness(monkeypatch)

    def _forbidden(*_args, **_kwargs):
        raise AssertionError("an offline test attempted to create a real retailer session")

    import curl_cffi.requests as cffi_requests
    monkeypatch.setattr(cffi_requests, "Session", _forbidden)

    # Unsupported stores and an open circuit must both short-circuit before any client.
    res = client.post(
        "/search",
        headers={"x-fetcher-token": TEST_TOKEN},
        json={"query": "milk", "stores": ["aldi", "lidl"], "timeoutMs": 2000},
    )
    assert res.status_code == 200
    for store in ("aldi", "lidl"):
        assert res.json()["stores"][store]["status"] == "unsupported"
