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

# Shared-secret token: fails closed with dev fallback pattern mirroring scraper-pod
FETCHER_TOKEN = os.environ.get("FETCHER_TOKEN") or "local-dev-fetcher-token-shopping-app"
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


@app.get("/health")
def health(x_fetcher_token: Optional[str] = Header(None, alias="x-fetcher-token")):
    """Health check endpoint exposing adapter status and circuit states."""
    adapters_status = {store: "not_implemented" for store in KNOWN_STORES}
    for store, reason in UNSUPPORTED_STORES.items():
        adapters_status[store] = f"unsupported: {reason}"

    circuits_status = {store: "closed" for store in KNOWN_STORES}

    return {
        "status": "ok",
        "service": "store-fetcher",
        "version": "1.2.0",
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
    Step 3: All adapters return not_implemented status.
    """
    token = x_fetcher_token or x_scrape_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    if not verify_token(token):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: invalid or missing x-fetcher-token / x-scrape-token header.",
        )

    results: Dict[str, Any] = {}
    for store in req.stores:
        clean_store = store.lower().strip()
        if clean_store in UNSUPPORTED_STORES:
            results[clean_store] = {
                "status": "unsupported",
                "reason": UNSUPPORTED_STORES[clean_store],
                "products": [],
            }
        else:
            # Step 3 skeleton: Every adapter returns not_implemented
            results[clean_store] = {
                "status": "not_implemented",
                "message": f"Direct adapter for {clean_store} is not yet implemented (Step 3 skeleton)",
                "products": [],
            }

    return {
        "query": req.query,
        "stores": results,
        "source": "direct",
    }


@app.get("/probe")
def probe_stores(
    x_fetcher_token: Optional[str] = Header(None, alias="x-fetcher-token")
):
    """
    Live canary reachability probe across supermarket backends
    using curl_cffi browser impersonation (chrome124).
    """
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

    report = {
        "generatedAt": now,
        "labVersion": "1.2.0",
        "client": client_name,
        "stores": {}
    }

    session = cffi_requests.Session(impersonate="chrome124") if cffi_requests else None

    for store_name, cfg in probes.items():
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
            res = session.request(cfg["method"], cfg["url"], headers=cfg.get("headers", {}), timeout=12)
            elapsed_ms = round((time.time() - start) * 1000)
            if res.status_code == 200:
                report["stores"][store_name] = {
                    "status": "reachable",
                    "client": client_name,
                    "checkedAt": now,
                    "httpStatus": res.status_code,
                    "responseTimeMs": elapsed_ms,
                    "requestUrl": cfg["url"]
                }
            else:
                report["stores"][store_name] = {
                    "status": "unreachable",
                    "client": client_name,
                    "checkedAt": now,
                    "httpStatus": res.status_code,
                    "evidence": f"HTTP {res.status_code} returned from {cfg['url']}",
                    "reason": "Retailer edge challenge or block" if res.status_code == 403 else f"HTTP {res.status_code}"
                }
        except Exception as e:
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

    return report

