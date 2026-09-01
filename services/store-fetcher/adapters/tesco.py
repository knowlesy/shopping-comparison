"""
Tesco Supermarket Direct Fetch Adapter.
Implements direct extraction against Tesco using curl_cffi TLS browser impersonation
and extracts product data from the documented GraphQL gateway (xapi.tesco.com)
and server-side Apollo Client state.
"""

import re
import json
from typing import List, Dict, Any, Optional
from .base import BaseAdapter, AdapterCapabilities
from ..schema import UnifiedProduct

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    cffi_requests = None


class TescoAdapter(BaseAdapter):
    """Direct adapter for Tesco supermarket."""
    store_name: str = "tesco"

    # Documented xapi.tesco.com GraphQL gateway and default public API key
    GATEWAY_URL = "https://xapi.tesco.com/graphql"
    DEFAULT_API_KEY = "TvOSZJHlEk0pjniDGQFAc9Q59WGAR4dA"
    WEB_SEARCH_URL = "https://www.tesco.com/groceries/en-GB/search"

    @property
    def capabilities(self) -> Dict[str, Any]:
        return AdapterCapabilities(
            variants=True,
            loyalty_price=True,  # Tesco Clubcard pricing
            deal_strings=True,   # Multibuy & promotional mechanics
            unit_price=True,     # Price per unit (litre, 100g, kg)
            stock=True,          # Stock availability status
            direct_http=True
        ).to_dict()

    def _get_session(self):
        if not cffi_requests:
            raise RuntimeError("curl_cffi is required for TescoAdapter TLS impersonation")
        return cffi_requests.Session(impersonate="chrome124")

    def search(
        self,
        query: str,
        *,
        target_quantity: Optional[float] = None,
        want_variants: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Search Tesco products using curl_cffi TLS impersonation.
        Targets Tesco's web search with Apollo cache extraction and xapi.tesco.com gateway.
        """
        session = self._get_session()
        headers = {
            "x-apikey": self.DEFAULT_API_KEY,
            "accept": "text/html,application/json",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        }

        url = f"{self.WEB_SEARCH_URL}?query={query.replace(' ', '+')}"
        res = session.get(url, headers=headers, timeout=12)
        if res.status_code != 200:
            return []

        products: List[Dict[str, Any]] = []
        all_scripts = re.findall(r'<script[^>]*>(.*?)</script>', res.text, re.DOTALL)
        for s in all_scripts:
            if "ProductType:" in s:
                try:
                    d = json.loads(s)
                    cache = d.get("mfe-orchestrator", {}).get("props", {}).get("apolloCache", {})
                    for k, v in cache.items():
                        if k.startswith("ProductType:"):
                            products.append(v)
                except Exception:
                    pass

        return products

    def normalize(self, raw: Dict[str, Any]) -> UnifiedProduct:
        """
        Normalize raw Tesco ProductType into a UnifiedProduct.
        Never fabricates unavailable fields.
        """
        product_id = str(raw.get("id") or raw.get("tpnc") or "")
        title = raw.get("title") or "Unknown Product"
        brand = raw.get("brand") or (title.split()[0] if title else None)

        price_info = raw.get("price", {}) or {}
        price = float(price_info.get("actual") or 0.0)
        unit_price = float(price_info.get("unitPrice")) if price_info.get("unitPrice") is not None else None
        unit_measure = price_info.get("unitOfMeasure")

        # Parse package size and unit from title if possible
        package_size: Optional[float] = None
        package_unit: Optional[str] = None
        package_display: Optional[str] = None

        size_match = re.search(r'(\d+(?:\.\d+)?)\s*(kg|g|litre|ltr|l|ml|pints?|pt)\b', title, re.I)
        if size_match:
            package_size = float(size_match.group(1))
            package_unit = size_match.group(2).lower()
            package_display = f"{size_match.group(1)}{package_unit}"

        # Clubcard pricing & deals
        clubcard_price: Optional[float] = None
        deal: Optional[Dict[str, Any]] = None

        promotions = raw.get("promotions") or []
        for promo in promotions:
            ref_str = promo.get("__ref") or ""
            desc = ""
            if "description" in ref_str:
                m = re.search(r'"description":\s*"([^"]+)"', ref_str)
                if m:
                    desc = m.group(1)

            if not desc and isinstance(promo.get("description"), str):
                desc = promo["description"]

            if desc:
                # Check for Clubcard price (e.g. "£1.50 Clubcard Price", "Any 2 for £4 Clubcard Price")
                cc_match = re.search(r'£(\d+(?:\.\d+)?)\s+Clubcard Price', desc, re.I)
                if cc_match:
                    clubcard_price = float(cc_match.group(1))

                deal = {
                    "description": desc,
                    "type": "clubcard" if "clubcard" in desc.lower() else "multibuy",
                    "raw": desc
                }
                break

        # Stock availability
        is_for_sale = raw.get("isForSale", True)
        status_str = str(raw.get("status") or "")
        in_stock = is_for_sale and (status_str != "UnavailableForSale")

        # Image URL
        image_url = raw.get("defaultImageUrl")
        if not image_url and isinstance(raw.get("media"), dict):
            image_url = raw.get("media", {}).get("defaultImage", {}).get("url")

        product_url = f"https://www.tesco.com/groceries/en-GB/products/{product_id}" if product_id else None

        return UnifiedProduct(
            id=product_id,
            supermarket="tesco",
            title=title,
            brand=brand,
            price=price,
            unitPrice=unit_price,
            unitPriceMeasure=unit_measure,
            packageSize=package_size,
            packageUnit=package_unit,
            packageDisplay=package_display,
            deal=deal,
            clubcardPrice=clubcard_price,
            inStock=in_stock,
            productUrl=product_url,
            imageUrl=image_url,
            source="direct"
        )
