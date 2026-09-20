"""
ShoppingWise Store Fetcher Sidecar
High-trust Tier 1 direct supermarket fetch adapters service.
"""

import os
import hmac
import time
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(title="ShoppingWise Store Fetcher", version="1.2.0")

# Shared-secret token.
#
# The development fallback below is published in this repository. Production refuses to
# start without a real secret, rather than silently running on a token anyone can read.
DEV_FETCHER_TOKEN = "local-dev-fetcher-token-shopping-app"


def resolve_fetcher_token(env=os.environ):
    """Return the shared secret, or raise in production when it is missing or default."""
    configured = (env.get("FETCHER_TOKEN") or "").strip()

    if env.get("NODE_ENV") != "production" and env.get("ENVIRONMENT") != "production":
        return configured or DEV_FETCHER_TOKEN

    if not configured:
        raise RuntimeError(
            "FETCHER_TOKEN is not set. Production requires a real shared secret; set it "
            "from a k3s Secret or the compose environment. To use the published "
            "development token, run with NODE_ENV other than 'production'."
        )
    if configured == DEV_FETCHER_TOKEN:
        raise RuntimeError(
            "FETCHER_TOKEN is set to the published development token, which is in the "
            "public repository and must not be used in production. "
            "Generate one with: openssl rand -hex 24"
        )
    return configured


FETCHER_TOKEN = resolve_fetcher_token()
SCRAPE_TOKEN = FETCHER_TOKEN

KNOWN_STORES = ["tesco", "sainsburys", "asda", "morrisons", "iceland"]
UNSUPPORTED_STORES = {
    "aldi": "No UK online grocery platform — estimated data only",
    "lidl": "No UK online grocery platform — estimated data only",
}

START_TIME = time.time()


# Defensive security headers mirroring scraper-pod
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    return response


def verify_token(token: Optional[str]) -> bool:
    """Timing-safe constant-time comparison of the shared secret token."""
    if not token or not isinstance(token, str):
        return False
    return hmac.compare_digest(token.strip(), FETCHER_TOKEN)


class SearchRequest(BaseModel):
    query: str = Field(..., description="Item search query (e.g. 'semi skimmed milk')")
    stores: List[str] = Field(default_factory=lambda: list(KNOWN_STORES), description="Stores to query")
    targetQuantity: Optional[float] = Field(None, description="Requested target quantity")
    unit: Optional[str] = Field(None, description="Requested unit (g, kg, ml, l)")
    wantVariants: Optional[bool] = Field(False, description="Whether to fetch all size variants")
    timeoutMs: Optional[int] = Field(
        None,
        description=(
            "Whole-request budget in milliseconds. Omitted means the server default. "
            f"Capped at the server maximum. Once exhausted no further store is contacted "
            "and the remaining stores are reported as deadline_exceeded."
        ),
    )


try:
    from .registry import get_adapter, STORE_REGISTRY
    from .politeness import rate_limiter, circuit_breaker, daily_request_cap
    from .deadline import RequestDeadline, MIN_USEFUL_SLICE_SEC
except ImportError:
    from registry import get_adapter, STORE_REGISTRY
    from politeness import rate_limiter, circuit_breaker, daily_request_cap
    from deadline import RequestDeadline, MIN_USEFUL_SLICE_SEC


# ---------------------------------------------------------------------------
# Whole-request deadline contract
# ---------------------------------------------------------------------------
# A caller may declare its own budget as timeoutMs. A caller that declares nothing gets
# SEARCH_DEFAULT_TIMEOUT_MS, so callers written before this contract are unaffected. The
# sidecar always caps the budget at SEARCH_MAX_TIMEOUT_MS: how long this service is
# willing to work is the service's decision, not the caller's.
#
# Contract for /search:
#   * stores are attempted in request order until the budget is exhausted;
#   * a store that is never attempted gets status "deadline_exceeded" with empty
#     products, so the caller can tell "no results" from "never asked";
#   * results already collected are always returned;
#   * the response carries a "deadline" block reporting the budget and what was used.
SEARCH_DEFAULT_TIMEOUT_MS = int(os.environ.get("SEARCH_DEFAULT_TIMEOUT_MS") or 30000)
SEARCH_MAX_TIMEOUT_MS = int(os.environ.get("SEARCH_MAX_TIMEOUT_MS") or 60000)
PROBE_DEFAULT_TIMEOUT_MS = int(os.environ.get("PROBE_DEFAULT_TIMEOUT_MS") or 45000)
PROBE_PER_STORE_TIMEOUT_SEC = 12


@app.get("/health")
def health(x_fetcher_token: Optional[str] = Header(None, alias="x-fetcher-token")):
    """Health check endpoint exposing adapter status and circuit states."""
    adapters_status = {}
    for store in KNOWN_STORES:
        reg = STORE_REGISTRY.get(store, {})
        if reg.get("supported"):
            adapters_status[store] = "implemented: " + reg.get("notes", "direct adapter active")
        else:
            adapters_status[store] = reg.get("reason", "unsupported")
    for store, reason in UNSUPPORTED_STORES.items():
        adapters_status[store] = f"unsupported: {reason}"

    circuits_status = {store: circuit_breaker.get_state(store) for store in KNOWN_STORES}

    return {
        "status": "ok",
        "service": "store-fetcher",
        "version": "1.3.0",
        "uptime": round(time.time() - START_TIME, 2),
        "adapters": adapters_status,
        "circuits": circuits_status,
    }


@app.post("/search")
def search(
    req: SearchRequest,
    x_fetcher_token: Optional[str] = Header(None, alias="x-fetcher-token"),
    x_scrape_token: Optional[str] = Header(None, alias="x-scrape-token"),
    authorization: Optional[str] = Header(None, alias="authorization"),
):
    """
    Search endpoint across direct retailer backends.
    Enforces timing-safe token authentication.
    Dispatches to retailer adapters with politeness delays and circuit breaking.
    """
    token = x_fetcher_token or x_scrape_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    if not verify_token(token):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: invalid or missing x-fetcher-token / x-scrape-token header.",
        )

    deadline = RequestDeadline.from_ms(
        req.timeoutMs,
        default_ms=SEARCH_DEFAULT_TIMEOUT_MS,
        max_ms=SEARCH_MAX_TIMEOUT_MS,
    )

    results: Dict[str, Any] = {}
    for store in req.stores:
        clean_store = store.lower().strip()

        # Stop starting new work once the budget is spent. Reporting the store
        # explicitly keeps "we never asked" distinguishable from "no products".
        if not deadline.has_useful_time():
            results[clean_store] = {
                "status": "deadline_exceeded",
                "reason": (
                    f"Request budget of {round(deadline.budget_sec * 1000)}ms exhausted "
                    f"before {clean_store} was attempted"
                ),
                "products": [],
            }
            continue

        if clean_store in UNSUPPORTED_STORES:
            results[clean_store] = {
                "status": "unsupported",
                "reason": UNSUPPORTED_STORES[clean_store],
                "products": [],
            }
            continue

        reg_entry = STORE_REGISTRY.get(clean_store, {})
        if not reg_entry.get("supported", False):
            results[clean_store] = {
                "status": "unsupported",
                "reason": reg_entry.get("reason", f"Direct adapter for {clean_store} is unsupported"),
                "products": [],
            }
            continue

        if not circuit_breaker.is_available(clean_store):
            results[clean_store] = {
                "status": "circuit_open",
                "reason": f"Circuit breaker open for {clean_store}",
                "products": [],
            }
            continue

        if not daily_request_cap.check_and_increment(clean_store):
            results[clean_store] = {
                "status": "rate_limited",
                "reason": f"Daily request cap reached for {clean_store}",
                "products": [],
            }
            continue

        adapter = get_adapter(clean_store)
        if not adapter:
            results[clean_store] = {
                "status": "not_implemented",
                "message": f"Adapter instance not found for {clean_store}",
                "products": [],
            }
            continue

        try:
            # Politeness delay before hitting external retailer, bounded by what is
            # left: a politeness sleep must never be why a request outlives its caller.
            rate_limiter.wait_polite(clean_store, max_wait_sec=deadline.remaining())

            if deadline.expired():
                results[clean_store] = {
                    "status": "deadline_exceeded",
                    "reason": f"Request budget exhausted while waiting to contact {clean_store}",
                    "products": [],
                }
                continue

            raw_results = adapter.search(
                req.query,
                target_quantity=req.targetQuantity,
                want_variants=bool(req.wantVariants),
                deadline=deadline,
            )
            circuit_breaker.record_success(clean_store)

            normalized = []
            for raw in raw_results:
                try:
                    p = adapter.normalize(raw)
                    normalized.append(p.to_dict() if hasattr(p, "to_dict") else dict(p))
                except Exception:
                    pass

            results[clean_store] = {
                "status": "ok",
                "products": normalized,
            }
        except Exception as e:
            circuit_breaker.record_failure(clean_store)
            results[clean_store] = {
                "status": "error",
                "error": str(e),
                "products": [],
            }

    return {
        "query": req.query,
        "stores": results,
        "source": "direct",
        "deadline": deadline.snapshot(),
    }


@app.get("/probe")
def probe_stores(
    x_fetcher_token: Optional[str] = Header(None, alias="x-fetcher-token"),
    x_scrape_token: Optional[str] = Header(None, alias="x-scrape-token"),
    authorization: Optional[str] = Header(None, alias="authorization"),
):
    """
    Live canary reachability probe across supermarket backends
    using curl_cffi browser impersonation (chrome124).
    Enforces authentication, rate limits, circuit breaker, and daily caps.
    """
    token = x_fetcher_token or x_scrape_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    if not verify_token(token):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: invalid or missing x-fetcher-token / x-scrape-token header.",
        )

    from datetime import datetime, timezone
    try:
        from curl_cffi import requests as cffi_requests
    except ImportError:
        cffi_requests = None

    now = datetime.now(timezone.utc).isoformat()
    client_name = "curl_cffi/chrome124 (store-fetcher sidecar)"

    probes = {
        "tesco": {
            "url": "https://www.tesco.com/groceries/en-GB/search?query=semi%20skimmed%20milk",
            "method": "GET",
            "headers": {"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
        },
        "sainsburys": {
            "url": "https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/product?filter[keyword]=semi%20skimmed%20milk&page_number=1&page_size=24",
            "method": "GET",
            "headers": {"accept": "application/json"}
        },
        "asda": {
            "url": "https://groceries.asda.com/search/semi%20skimmed%20milk",
            "method": "GET",
            "headers": {"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
        },
        "morrisons": {
            "url": "https://groceries.morrisons.com/search?entry=semi%20skimmed%20milk",
            "method": "GET",
            "headers": {"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
        },
        "iceland": {
            "url": "https://www.iceland.co.uk/search?q=semi%20skimmed%20milk",
            "method": "GET",
            "headers": {"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
        }
    }

    deadline = RequestDeadline.from_ms(
        None,
        default_ms=PROBE_DEFAULT_TIMEOUT_MS,
        max_ms=PROBE_DEFAULT_TIMEOUT_MS,
    )

    report = {
        "generatedAt": now,
        "labVersion": "1.2.0",
        "client": client_name,
        "stores": {}
    }

    session = cffi_requests.Session(impersonate="chrome124") if cffi_requests else None

    for store_name, cfg in probes.items():
        # Same bound as /search: five retailers at a 12s timeout each, plus politeness
        # delays, otherwise outlives any caller waiting on the answer.
        if not deadline.has_useful_time():
            report["stores"][store_name] = {
                "status": "deadline_exceeded",
                "client": client_name,
                "checkedAt": now,
                "reason": (
                    f"Probe budget of {round(deadline.budget_sec * 1000)}ms exhausted "
                    f"before {store_name} was attempted"
                ),
            }
            continue

        if not circuit_breaker.is_available(store_name):
            report["stores"][store_name] = {
                "status": "circuit_open",
                "reason": f"Circuit breaker open for {store_name}",
            }
            continue

        if not daily_request_cap.check_and_increment(store_name):
            report["stores"][store_name] = {
                "status": "rate_limited",
                "reason": f"Daily request cap reached for {store_name}",
            }
            continue

        # RateLimiter's method is wait_polite(); calling a non-existent wait() made
        # every authenticated probe fail with HTTP 500 before it reached a retailer.
        rate_limiter.wait_polite(store_name, max_wait_sec=deadline.remaining())

        if not session:
            report["stores"][store_name] = {
                "status": "unreachable",
                "client": client_name,
                "checkedAt": now,
                "evidence": "curl_cffi not available in runtime"
            }
            continue

        start = time.time()
        try:
            res = session.request(
                cfg["method"],
                cfg["url"],
                headers=cfg.get("headers", {}),
                timeout=deadline.clamp(PROBE_PER_STORE_TIMEOUT_SEC, minimum_sec=1.0),
            )
            elapsed_ms = round((time.time() - start) * 1000)
            if res.status_code == 200:
                circuit_breaker.record_success(store_name)
                report["stores"][store_name] = {
                    "status": "reachable",
                    "client": client_name,
                    "checkedAt": now,
                    "httpStatus": res.status_code,
                    "responseTimeMs": elapsed_ms,
                    "requestUrl": cfg["url"]
                }
            else:
                circuit_breaker.record_failure(store_name)
                report["stores"][store_name] = {
                    "status": "unreachable",
                    "client": client_name,
                    "checkedAt": now,
                    "httpStatus": res.status_code,
                    "evidence": f"HTTP {res.status_code} returned from {cfg['url']}",
                    "reason": "Retailer edge challenge or block" if res.status_code == 403 else f"HTTP {res.status_code}"
                }
        except Exception as e:
            circuit_breaker.record_failure(store_name)
            elapsed_ms = round((time.time() - start) * 1000)
            report["stores"][store_name] = {
                "status": "unreachable",
                "client": client_name,
                "checkedAt": now,
                "httpStatus": 0,
                "evidence": str(e),
                "reason": f"Connection error: {e}"
            }

    # Explicitly declared unsupported stores
    for store_name, reason in UNSUPPORTED_STORES.items():
        report["stores"][store_name] = {
            "status": "unsupported",
            "client": client_name,
            "checkedAt": now,
            "reason": reason
        }

    report["deadline"] = deadline.snapshot()
    return report

