"""
Whole-request deadline for sidecar work.

The Node caller aborts its HTTP request after its own timeout, but that abort does
not stop the sidecar: without a deadline the sequential per-store loop keeps
contacting retailers long after nobody is waiting for the answer. A RequestDeadline
is created once per request and carried through the store loop and into each
adapter, so that:

  * no new store work starts once the budget is exhausted;
  * each individual network or browser operation is clamped to the time that is
    actually left rather than its own hardcoded timeout;
  * stores that were never attempted get an explicit status instead of vanishing.

Known limitation: this bounds when work *starts* and how long each operation is
*allowed* to take. It cannot cancel a synchronous call that is already running
inside curl_cffi or a browser page — Python threads are not cancellable. A single
operation can therefore still overrun the budget by up to its own clamped timeout.
"""

import time
from typing import Optional

# Below this, there is not enough time left to be worth contacting another store:
# the politeness delay alone would consume it.
MIN_USEFUL_SLICE_SEC = 1.0


class RequestDeadline:
    """A monotonic budget for one inbound request."""

    def __init__(self, budget_sec: float):
        self.budget_sec = max(0.0, float(budget_sec))
        self._started = time.monotonic()

    @classmethod
    def from_ms(
        cls,
        requested_ms: Optional[int],
        *,
        default_ms: int,
        max_ms: int,
    ) -> "RequestDeadline":
        """
        Build a deadline from a caller-supplied millisecond budget.

        A caller that sends nothing gets the server default, so existing callers keep
        working unchanged. A caller asking for more than max_ms is clamped: the sidecar,
        not the caller, owns the upper bound on how long it will work.
        """
        if requested_ms is None:
            budget_ms = default_ms
        else:
            try:
                budget_ms = int(requested_ms)
            except (TypeError, ValueError):
                budget_ms = default_ms
        budget_ms = max(0, min(budget_ms, max_ms))
        return cls(budget_ms / 1000.0)

    def elapsed(self) -> float:
        return time.monotonic() - self._started

    def remaining(self) -> float:
        return max(0.0, self.budget_sec - self.elapsed())

    def expired(self) -> bool:
        return self.remaining() <= 0.0

    def has_useful_time(self, minimum_sec: float = MIN_USEFUL_SLICE_SEC) -> bool:
        """True when enough time is left to be worth starting another store."""
        return self.remaining() >= minimum_sec

    def clamp(self, preferred_sec: float, *, minimum_sec: float = 0.1) -> float:
        """
        Bound an operation's own timeout by the time actually left.

        Never returns less than minimum_sec: a zero timeout is an error in most
        HTTP clients, and the caller should check expired()/has_useful_time() to
        decide whether to start at all.
        """
        return max(minimum_sec, min(float(preferred_sec), self.remaining()))

    def clamp_ms(self, preferred_ms: int, *, minimum_ms: int = 100) -> int:
        return int(self.clamp(preferred_ms / 1000.0, minimum_sec=minimum_ms / 1000.0) * 1000)

    def snapshot(self, *, minimum_sec: float = MIN_USEFUL_SLICE_SEC) -> dict:
        """
        Reportable state for the response body.

        `exceeded` and `acceptingNewWork` are not the same thing and callers need both:
        a request can stop contacting stores while time technically remains, because
        what is left is too short to be worth another store's politeness delay and
        round trip. Reporting only `exceeded` would make that look like the budget was
        never reached, and the skipped stores unexplained.
        """
        return {
            "budgetMs": round(self.budget_sec * 1000),
            "elapsedMs": round(self.elapsed() * 1000),
            "remainingMs": round(self.remaining() * 1000),
            "minUsefulSliceMs": round(minimum_sec * 1000),
            "exceeded": self.expired(),
            "acceptingNewWork": self.has_useful_time(minimum_sec),
        }
