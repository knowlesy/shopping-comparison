"""
Tier 2 Browser Rendering Service using Camoufox.
Provides stealth browser fallback execution for retailers requiring
JavaScript hydration, client-side SPA rendering, or edge anti-bot bypass.
"""

import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from typing import Dict, Any, List, Optional

logger = logging.getLogger("store_fetcher.browser")

# Graceful import check for Camoufox
try:
    from camoufox.sync_api import Camoufox
    CAMOUFOX_AVAILABLE = True
except ImportError:
    Camoufox = None
    CAMOUFOX_AVAILABLE = False


class Tier2Browser:
    """
    Camoufox stealth browser automation manager.
    Executes Tier 2 fallback requests with C++ level anti-detection,
    DOM hydration, and JSON data extraction.
    Reuses a persistent browser process across queries to avoid churn.

    Thread ownership
    ----------------
    Camoufox exposes Playwright's *synchronous* API, whose handles are bound to the
    thread that created them. FastAPI runs `def` endpoints in a worker threadpool, so
    two overlapping /search requests land on two different threads and would otherwise
    both reach this shared singleton — using a handle created on another thread is
    undefined behaviour, not merely a race.

    Every browser touch (start, new_page, close) is therefore submitted to one
    dedicated single-worker executor. That thread is the only owner of the browser, and
    because the executor has exactly one worker, calls are also serialised: overlapping
    requests queue instead of interleaving.

    Limitation: a submitted render can be waited on with a timeout, but Python cannot
    cancel it. If a render overruns, the caller stops waiting while the owner thread
    finishes the operation; the next caller queues behind it.
    """

    def __init__(self, headless: bool = True):
        self.headless = headless
        self._camoufox = None
        self._browser = None
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="camoufox-owner")
        self._owner_thread_id: Optional[int] = None
        self._shutdown = False

    def _assert_owner_thread(self):
        """Record, then enforce, that only one thread ever touches the browser."""
        current = threading.get_ident()
        if self._owner_thread_id is None:
            self._owner_thread_id = current
        elif self._owner_thread_id != current:
            raise RuntimeError(
                "Tier2Browser accessed from thread "
                f"{current}, but the browser is owned by thread {self._owner_thread_id}. "
                "All browser work must go through Tier2Browser._executor."
            )

    def _run_owned(self, fn, *args, timeout: Optional[float] = None, **kwargs):
        """Run fn on the owner thread and wait up to timeout for its result."""
        if self._shutdown:
            raise RuntimeError("Tier2Browser has been shut down")
        future = self._executor.submit(self._owned_call, fn, *args, **kwargs)
        return future.result(timeout=timeout)

    def _owned_call(self, fn, *args, **kwargs):
        self._assert_owner_thread()
        return fn(*args, **kwargs)

    def is_available(self) -> bool:
        """Check if Camoufox is installed and available in the current environment."""
        return CAMOUFOX_AVAILABLE

    def _ensure_browser(self):
        """Get or initialize persistent Camoufox browser instance. Owner thread only."""
        self._assert_owner_thread()
        if self._browser is not None:
            try:
                if self._browser.is_connected():
                    return self._browser
            except Exception:
                pass
            self._close_owned()

        if not CAMOUFOX_AVAILABLE or Camoufox is None:
            return None

        self._camoufox = Camoufox(headless=self.headless)
        self._browser = self._camoufox.start()
        return self._browser

    def close(self):
        """Close the browser. Safe to call from any thread; runs on the owner thread."""
        if self._shutdown:
            return
        if threading.get_ident() == self._owner_thread_id or self._owner_thread_id is None:
            self._close_owned()
        else:
            try:
                self._run_owned(self._close_owned, timeout=30)
            except Exception:
                pass

    def shutdown(self):
        """Close the browser and stop the owner thread. Not reusable afterwards."""
        self.close()
        self._shutdown = True
        self._executor.shutdown(wait=True)

    def _close_owned(self):
        """Close browser handle and exit Camoufox manager. Owner thread only."""
        if self._browser:
            try:
                self._browser.close()
            except Exception:
                pass
            self._browser = None
        if self._camoufox:
            try:
                self._camoufox.__exit__(None, None, None)
            except Exception:
                pass
            self._camoufox = None

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass

    def render_page(
        self,
        url: str,
        *,
        wait_until: str = "domcontentloaded",
        timeout_ms: int = 30000,
        wait_ms: int = 2000,
        wait_for_selector: Optional[str] = None,
        extract_ld_json: bool = True,
        wait_timeout_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Render a page on the browser's owner thread and return its DOM content,
        title and structured JSON-LD data.

        Callable from any thread: the work is submitted to the single owner thread,
        so concurrent callers queue rather than sharing a synchronous browser handle.

        wait_timeout_ms bounds how long *this caller* waits. It defaults to the page
        timeout plus a margin. Exceeding it returns a failure result; the owner thread
        keeps finishing that render (Python cannot cancel it) and the next caller queues.
        """
        budget_ms = wait_timeout_ms if wait_timeout_ms is not None else timeout_ms + wait_ms + 15000
        try:
            return self._run_owned(
                self._render_page_owned,
                url,
                wait_until=wait_until,
                timeout_ms=timeout_ms,
                wait_ms=wait_ms,
                wait_for_selector=wait_for_selector,
                extract_ld_json=extract_ld_json,
                timeout=budget_ms / 1000.0,
            )
        except FuturesTimeoutError:
            logger.warning(
                f"Tier 2 render for {url} exceeded the caller's {budget_ms}ms budget; "
                "the owner thread is still finishing it."
            )
            return {
                "success": False,
                "status": 0,
                "title": "",
                "html": "",
                "ld_json": [],
                "error": f"browser render exceeded caller budget of {budget_ms}ms",
                "timedOut": True,
            }
        except Exception as e:
            logger.warning(f"Tier 2 render dispatch failed for {url}: {e}")
            return {
                "success": False,
                "status": 0,
                "title": "",
                "html": "",
                "ld_json": [],
                "error": str(e),
            }

    def _render_page_owned(
        self,
        url: str,
        *,
        wait_until: str = "domcontentloaded",
        timeout_ms: int = 30000,
        wait_ms: int = 2000,
        wait_for_selector: Optional[str] = None,
        extract_ld_json: bool = True,
    ) -> Dict[str, Any]:
        """Actual render. Owner thread only — reached through render_page()."""
        browser = self._ensure_browser()
        if browser is None:
            return {
                "success": False,
                "status": 0,
                "title": "",
                "html": "",
                "ld_json": [],
                "error": "Camoufox is not available in runtime environment",
            }

        start_time = time.time()
        page = None
        try:
            page = browser.new_page()
            resp = page.goto(url, wait_until=wait_until, timeout=timeout_ms)
            status_code = resp.status if resp else 200

            if wait_for_selector:
                try:
                    page.wait_for_selector(wait_for_selector, timeout=min(timeout_ms, 10000))
                except Exception:
                    pass

            if wait_ms > 0:
                page.wait_for_timeout(wait_ms)

            title = page.title()
            html = page.content()

            ld_json_data: List[Dict[str, Any]] = []
            if extract_ld_json:
                scripts = page.query_selector_all('script[type="application/ld+json"]')
                for s in scripts:
                    try:
                        txt = s.inner_text().strip()
                        if txt:
                            parsed = json.loads(txt)
                            if isinstance(parsed, list):
                                ld_json_data.extend(parsed)
                            elif isinstance(parsed, dict):
                                ld_json_data.append(parsed)
                    except Exception:
                        pass

            elapsed_ms = round((time.time() - start_time) * 1000)
            return {
                "success": True,
                "status": status_code,
                "title": title,
                "html": html,
                "ld_json": ld_json_data,
                "elapsed_ms": elapsed_ms,
                "error": None,
            }
        except Exception as e:
            elapsed_ms = round((time.time() - start_time) * 1000)
            logger.warning(f"Tier 2 Camoufox browser rendering failed for {url}: {e}")
            return {
                "success": False,
                "status": 0,
                "title": "",
                "html": "",
                "ld_json": [],
                "elapsed_ms": elapsed_ms,
                "error": str(e),
            }
        finally:
            if page:
                try:
                    page.close()
                except Exception:
                    pass


# Shared singleton instance
browser_service = Tier2Browser(headless=True)
