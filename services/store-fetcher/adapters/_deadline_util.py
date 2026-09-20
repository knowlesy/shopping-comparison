"""
Deadline clamping helpers shared by the retailer adapters.

Adapters keep their own preferred timeouts as the upper bound — those express what the
retailer realistically needs. These helpers lower that bound to whatever the
whole-request deadline has left, so one slow store cannot consume the budget the caller
allowed for all of them. With no deadline the adapter's own value is returned unchanged,
which is what pre-deadline callers get.
"""

from typing import Optional


def clamp_timeout(deadline, preferred_sec: float, *, minimum_sec: float = 1.0) -> float:
    """Seconds, for HTTP client timeouts."""
    if deadline is None:
        return preferred_sec
    return deadline.clamp(preferred_sec, minimum_sec=minimum_sec)


def clamp_timeout_ms(deadline, preferred_ms: int, *, minimum_ms: int = 1000) -> int:
    """Milliseconds, for browser page timeouts."""
    if deadline is None:
        return preferred_ms
    return deadline.clamp_ms(preferred_ms, minimum_ms=minimum_ms)


def clamp_wait_ms(deadline, preferred_ms: int) -> int:
    """
    Milliseconds, for a post-load settle wait.

    Unlike a timeout this is time spent deliberately, so when little budget remains it
    is dropped entirely rather than floored at a minimum.
    """
    if deadline is None:
        return preferred_ms
    remaining_ms = int(deadline.remaining() * 1000)
    if remaining_ms <= 0:
        return 0
    return max(0, min(preferred_ms, remaining_ms))
