"""
Politeness, Rate Limiting, Circuit Breaker, and Escalation Engine.
Enforces request throttling, randomized jittered delays, per-store daily caps,
circuit breaking, configurable proxy routing, and managed Tier 3 escalation boundaries.
"""

import os
import json
import time
import random
from typing import Dict, Any, Optional
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Rate Limiter & Politeness (Gaussian Delay + Jittered Exponential Backoff)
# ---------------------------------------------------------------------------
class RateLimiter:
    """
    Politeness rate limiter with Gaussian inter-request delay
    and jittered exponential backoff for HTTP 429 Too Many Requests.
    """
    def __init__(
        self,
        mean_delay_sec: float = 1.2,
        std_dev_sec: float = 0.4,
        min_delay_sec: float = 0.5,
        base_backoff_sec: float = 2.0,
        max_backoff_sec: float = 60.0
    ):
        self.mean_delay = mean_delay_sec
        self.std_dev = std_dev_sec
        self.min_delay = min_delay_sec
        self.base_backoff = base_backoff_sec
        self.max_backoff = max_backoff_sec
        self._last_request_time: Dict[str, float] = {}

    def get_polite_delay(self) -> float:
        """Calculate randomized Gaussian inter-request delay."""
        delay = random.gauss(self.mean_delay, self.std_dev)
        return max(self.min_delay, delay)

    def calculate_backoff(self, attempt: int, retry_after_header: Optional[str] = None) -> float:
        """
        Compute backoff for HTTP 429 response.
        If Retry-After header is provided, it is honoured absolutely.
        Otherwise computes exponential backoff with full jitter:
        delay = min(max_backoff, base * 2 ** attempt) + random.uniform(0, jitter)
        """
        if retry_after_header:
            try:
                retry_sec = float(retry_after_header.strip())
                if retry_sec > 0:
                    return retry_sec
            except (ValueError, TypeError):
                pass

        # Exponential backoff with full jitter
        exponential_part = min(self.max_backoff, self.base_backoff * (2 ** attempt))
        jitter = random.uniform(0, exponential_part * 0.5)
        return exponential_part + jitter

    def wait_polite(self, host: str):
        """Throttle execution politely before making a network request."""
        now = time.time()
        last = self._last_request_time.get(host, 0)
        elapsed = now - last
        delay = self.get_polite_delay()
        if elapsed < delay:
            time.sleep(delay - elapsed)
        self._last_request_time[host] = time.time()


# ---------------------------------------------------------------------------
# Per-Store Circuit Breaker
# ---------------------------------------------------------------------------
class StoreCircuitBreaker:
    """
    Per-store circuit breaker: N consecutive failures -> open for M minutes -> half-open probe.
    """
    def __init__(self, failure_threshold: int = 5, recovery_timeout_sec: float = 300.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout_sec
        self._failure_counts: Dict[str, int] = {}
        self._circuit_states: Dict[str, str] = {}  # 'closed', 'open', 'half-open'
        self._opened_timestamps: Dict[str, float] = {}

    def get_state(self, store: str) -> str:
        state = self._circuit_states.get(store, "closed")
        if state == "open":
            opened_at = self._opened_timestamps.get(store, 0)
            if time.time() - opened_at > self.recovery_timeout:
                self._circuit_states[store] = "half-open"
                return "half-open"
        return state

    def record_success(self, store: str):
        self._failure_counts[store] = 0
        self._circuit_states[store] = "closed"

    def record_failure(self, store: str):
        count = self._failure_counts.get(store, 0) + 1
        self._failure_counts[store] = count
        if count >= self.failure_threshold:
            self._circuit_states[store] = "open"
            self._opened_timestamps[store] = time.time()

    def is_available(self, store: str) -> bool:
        return self.get_state(store) != "open"


# ---------------------------------------------------------------------------
# Daily Request Cap
# ---------------------------------------------------------------------------
class DailyRequestCap:
    """
    Enforces hard daily request cap per store (DAILY_CAP / MAX_REQUESTS_PER_DAY)
    persisted across server restarts.
    """
    DAILY_CAP: int = 1000
    MAX_REQUESTS_PER_DAY: int = 1000

    def __init__(self, storage_path: str = "/tmp/store_daily_caps.json"):
        self.storage_path = storage_path
        self._counts: Dict[str, int] = {}
        self._current_day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        self._load()

    def _load(self):
        try:
            if os.path.exists(self.storage_path):
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data.get("day") == self._current_day:
                        self._counts = data.get("counts", {})
        except Exception:
            self._counts = {}

    def _save(self):
        try:
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump({"day": self._current_day, "counts": self._counts}, f)
        except Exception:
            pass

    def check_and_increment(self, store: str) -> bool:
        """Returns True if within daily cap, False if cap exceeded."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if today != self._current_day:
            self._current_day = today
            self._counts = {}

        current_count = self._counts.get(store, 0)
        if current_count >= self.DAILY_CAP:
            return False

        self._counts[store] = current_count + 1
        self._save()
        return True

    def get_count(self, store: str) -> int:
        return self._counts.get(store, 0)


# ---------------------------------------------------------------------------
# Proxy Configuration Layer
# ---------------------------------------------------------------------------
class ProxyInterface:
    """
    Configurable proxy layer interface for curl_cffi and HTTP sessions.
    Unset by default (None) for local residential connections.
    Configured via PROXY_URL and PROXY_TYPE environment variables.
    """
    def __init__(self):
        self.proxy_url: Optional[str] = os.environ.get("PROXY_URL") or None
        self.proxy_type: str = os.environ.get("PROXY_TYPE") or "residential"

    @property
    def is_configured(self) -> bool:
        return bool(self.proxy_url and self.proxy_url.strip())

    def get_proxies_dict(self) -> Optional[Dict[str, str]]:
        if not self.is_configured:
            return None
        return {
            "http": self.proxy_url.strip(),
            "https": self.proxy_url.strip()
        }


# ---------------------------------------------------------------------------
# Tier 3 Managed Unblocker (Explicitly Disabled by Default)
# ---------------------------------------------------------------------------
class Tier3ManagedUnblocker:
    """
    Tier 3 managed unblocker interface (e.g. Bright Data, Scrapfly, Decap).
    Strictly opt-in and disabled by default.
    """
    def __init__(self):
        # Explicit disabled-by-default state
        self.enabled: bool = False
        self.status: str = "disabled"
        self.service_name: Optional[str] = os.environ.get("TIER3_UNBLOCKER_SERVICE") or None

    def can_escalate(self) -> bool:
        """Tier 3 is disabled by default and requires explicit opt-in setting."""
        return self.enabled and bool(self.service_name)


# Global singletons
rate_limiter = RateLimiter()
circuit_breaker = StoreCircuitBreaker()
daily_request_cap = DailyRequestCap()
proxy_interface = ProxyInterface()
tier3_unblocker = Tier3ManagedUnblocker()
