"""
Tier 2 Browser Rendering Service using Camoufox.
Provides stealth browser fallback execution for retailers requiring
JavaScript hydration, client-side SPA rendering, or edge anti-bot bypass.
"""

import json
import logging
import time
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
    """

    def __init__(self, headless: bool = True):
        self.headless = headless

    def is_available(self) -> bool:
        """Check if Camoufox is installed and available in the current environment."""
        return CAMOUFOX_AVAILABLE

    def render_page(
        self,
        url: str,
        *,
        wait_until: str = "domcontentloaded",
        timeout_ms: int = 30000,
        wait_ms: int = 2000,
        wait_for_selector: Optional[str] = None,
        extract_ld_json: bool = True,
    ) -> Dict[str, Any]:
        """
        Render a page using Camoufox stealth browser and extract DOM content,
        page title, and structured JSON-LD data.
        """
        if not CAMOUFOX_AVAILABLE or Camoufox is None:
            return {
                "success": False,
                "status": 0,
                "title": "",
                "html": "",
                "ld_json": [],
                "error": "Camoufox is not available in runtime environment",
            }

        start_time = time.time()
        try:
            with Camoufox(headless=self.headless) as browser:
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


# Shared singleton instance
browser_service = Tier2Browser(headless=True)
