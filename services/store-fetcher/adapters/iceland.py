"""
Iceland Supermarket Direct Fetch Adapter.
Iceland uses a Mobify PWA shell with client-side Algolia search integration.
The server-rendered search page leaves productsById empty in the initial state.
Provides a Tier 2 Camoufox stealth browser rendering path for dynamic execution.
"""

from typing import List, Dict, Any, Optional
try:
    from ._deadline_util import clamp_timeout_ms as _clamp_timeout_ms, clamp_wait_ms as _clamp_wait_ms
    from ..deadline import RequestDeadline
    from .base import BaseAdapter, AdapterCapabilities
    from ..schema import UnifiedProduct
    from ..browser import browser_service
except (ImportError, ValueError):
    from adapters._deadline_util import clamp_timeout_ms as _clamp_timeout_ms, clamp_wait_ms as _clamp_wait_ms
    from deadline import RequestDeadline
    from adapters.base import BaseAdapter, AdapterCapabilities
    from schema import UnifiedProduct
    from browser import browser_service


class IcelandAdapter(BaseAdapter):
    """
    Direct adapter for Iceland supermarket.
    Supports Tier 2 Camoufox stealth browser fallback.
    """
    store_name: str = "iceland"

    @property
    def capabilities(self) -> Dict[str, Any]:
        return AdapterCapabilities(
            variants=False,
            loyalty_price=False,
            deal_strings=False,
            unit_price=True,
            stock=False,
            direct_http=False
        ).to_dict()

    def search(
        self,
        query: str,
        *,
        target_quantity: Optional[float] = None,
        want_variants: bool = False,
        deadline: Optional["RequestDeadline"] = None
    ) -> List[Dict[str, Any]]:
        """
        Iceland search via Tier 2 Camoufox browser rendering.
        If browser execution is unavailable or exceeds sidecar politeness boundaries,
        returns empty list to fall through gracefully to aggregator/catalog.
        """
        if not browser_service.is_available():
            return []

        search_url = f"https://www.iceland.co.uk/search?q={query.strip()}"
        res = browser_service.render_page(
            search_url,
            wait_until="domcontentloaded",
            timeout_ms=_clamp_timeout_ms(deadline, 30000),
            wait_ms=_clamp_wait_ms(deadline, 2500),
            wait_for_selector='script[type="application/ld+json"]',
            extract_ld_json=True
        )

        if not res.get("success"):
            return []

        products = []
        for item in res.get("ld_json", []):
            if item.get("@type") == "Product":
                products.append(item)
            elif item.get("@type") == "ItemList":
                for elem in item.get("itemListElement", []):
                    if isinstance(elem, dict) and elem.get("@type") == "Product":
                        products.append(elem)

        return products

    def normalize(self, raw: Dict[str, Any]) -> UnifiedProduct:
        """Normalizes Iceland raw product payload (schema.org Product or internal API) into UnifiedProduct."""
        # Extract SKU / ID from URL or attributes
        item_id = str(raw.get("id") or raw.get("sku") or "")
        if not item_id and "url" in raw:
            url_str = str(raw["url"])
            if ".html" in url_str:
                parts = url_str.split(".html")[0].split("/")
                if parts:
                    item_id = parts[-1]

        title = raw.get("name") or raw.get("title") or "Unknown Iceland Item"
        
        # Price extraction from schema.org offer or direct dict
        price = 0.0
        if "offers" in raw and isinstance(raw["offers"], dict):
            offer = raw["offers"]
            if "priceSpecification" in offer and isinstance(offer["priceSpecification"], dict):
                price = float(offer["priceSpecification"].get("price") or 0.0)
            elif "price" in offer:
                price = float(offer.get("price") or 0.0)
        elif "price" in raw:
            price = float(raw.get("price") or 0.0)

        # Brand extraction
        brand = "Iceland"
        if isinstance(raw.get("brand"), dict):
            brand = raw["brand"].get("name") or "Iceland"
        elif isinstance(raw.get("brand"), str) and raw["brand"].strip():
            brand = raw["brand"].strip()

        return UnifiedProduct(
            id=item_id,
            supermarket="iceland",
            title=title,
            brand=brand,
            price=price,
            product_url=raw.get("url"),
            source="direct"
        )
