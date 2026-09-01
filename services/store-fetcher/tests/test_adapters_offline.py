import os
import json
import pytest
import sys

# Ensure store-fetcher root is on sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
FETCHER_ROOT = os.path.dirname(CURRENT_DIR)
REPO_ROOT = os.path.dirname(os.path.dirname(FETCHER_ROOT))
if FETCHER_ROOT not in sys.path:
    sys.path.insert(0, FETCHER_ROOT)

from schema import UnifiedProduct
from adapters.tesco import TescoAdapter
from adapters.sainsburys import SainsburysAdapter
from adapters.morrisons import MorrisonsAdapter
from politeness import StoreCircuitBreaker, DailyRequestCap, RateLimiter

FIXTURES_DIR = os.path.join(REPO_ROOT, "tests", "fixtures", "store-payloads")


def test_tesco_normalization_offline():
    fixture_path = os.path.join(FIXTURES_DIR, "tesco-semi-skimmed-milk-2026-09-01.json")
    assert os.path.exists(fixture_path), f"Fixture not found: {fixture_path}"

    with open(fixture_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    adapter = TescoAdapter()
    assert adapter.capabilities["variants"] is True
    assert adapter.capabilities["loyalty_price"] is True

    items = data.get("payload", {}).get("products", [])
    assert len(items) > 0, "No items found in Tesco fixture"

    products = []
    for raw in items:
        p = adapter.normalize(raw)
        assert isinstance(p, UnifiedProduct)
        assert p.supermarket == "tesco"
        assert p.price > 0
        products.append(p)

    assert len(products) > 0


def test_sainsburys_normalization_offline():
    fixture_path = os.path.join(FIXTURES_DIR, "sainsburys-semi-skimmed-milk-2026-09-01.json")
    assert os.path.exists(fixture_path), f"Fixture not found: {fixture_path}"

    with open(fixture_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    adapter = SainsburysAdapter()
    assert adapter.capabilities["variants"] is True
    assert adapter.capabilities["loyalty_price"] is True

    items = data.get("payload", {}).get("products", [])
    assert len(items) > 0, "No items found in Sainsbury's fixture"

    products = []
    for raw in items:
        p = adapter.normalize(raw)
        assert isinstance(p, UnifiedProduct)
        assert p.supermarket == "sainsburys"
        assert p.price > 0
        products.append(p)

    assert len(products) > 0


def test_morrisons_normalization_offline():
    fixture_path = os.path.join(FIXTURES_DIR, "morrisons-semi-skimmed-milk-2026-09-01.json")
    assert os.path.exists(fixture_path), f"Fixture not found: {fixture_path}"

    with open(fixture_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    adapter = MorrisonsAdapter()
    assert adapter.capabilities["variants"] is True

    items = data.get("payload", {}).get("products", [])
    assert len(items) > 0, "No items found in Morrisons fixture"

    products = []
    for raw in items:
        p = adapter.normalize(raw)
        assert isinstance(p, UnifiedProduct)
        assert p.supermarket == "morrisons"
        assert p.price > 0
        products.append(p)

    assert len(products) > 0


def test_circuit_breaker_offline():
    cb = StoreCircuitBreaker(failure_threshold=3, recovery_timeout_sec=60.0)
    assert cb.is_available("tesco") is True

    cb.record_failure("tesco")
    cb.record_failure("tesco")
    assert cb.is_available("tesco") is True

    cb.record_failure("tesco")
    assert cb.is_available("tesco") is False
    assert cb.get_state("tesco") == "open"

    cb.record_success("tesco")
    assert cb.is_available("tesco") is True
    assert cb.get_state("tesco") == "closed"


def test_daily_request_cap_offline(tmp_path):
    cap_file = os.path.join(tmp_path, "test_daily_caps.json")
    cap = DailyRequestCap(storage_path=cap_file)
    cap.DAILY_CAP = 5

    for _ in range(5):
        assert cap.check_and_increment("tesco") is True

    assert cap.check_and_increment("tesco") is False
    assert cap.get_count("tesco") == 5


def test_politeness_delay_bounds():
    limiter = RateLimiter(mean_delay_sec=1.2, std_dev_sec=0.3, min_delay_sec=0.5)
    for _ in range(20):
        delay = limiter.get_polite_delay()
        assert delay >= 0.5
