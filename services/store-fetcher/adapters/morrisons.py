"""
Morrisons Supermarket Direct Fetch Adapter.
Implements direct extraction against Morrisons web search
extracting structured productEntities from server-rendered window.__INITIAL_STATE__.
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


class MorrisonsAdapter(BaseAdapter):
    """Direct adapter for Morrisons supermarket."""
    store_name: str = "morrisons"

    SEARCH_URL = "https://groceries.morrisons.com/search"

    @property
    def capabilities(self) -> Dict[str, Any]:
        return AdapterCapabilities(
            variants=True,
            loyalty_price=True,
            deal_strings=True,
            unit_price=True,
            stock=True,
            direct_http=True
        ).to_dict()

    def _get_session(self):
        if not cffi_requests:
            raise RuntimeError("curl_cffi is required for MorrisonsAdapter")
        return cffi_requests.Session(impersonate="chrome124")

    def search(
        self,
        query: str,
        *,
        target_quantity: Optional[float] = None,
        want_variants: bool = False
    ) -> List[Dict[str, Any]]:
        """Search products on Morrisons and extract productEntities from __INITIAL_STATE__."""
        session = self._get_session()
        headers = {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        }
        url = f"{self.SEARCH_URL}?entry={query.replace(' ', '+')}"

        res = session.get(url, headers=headers, timeout=12)
        if res.status_code != 200:
            return []

        idx = res.text.find("window.__INITIAL_STATE__=")
        if idx == -1:
            return []

        try:
            start_idx = idx + len("window.__INITIAL_STATE__=")
            data, _ = json.JSONDecoder().raw_decode(res.text[start_idx:])
            entities = data.get("data", {}).get("products", {}).get("productEntities", {})
            return list(entities.values())
        except Exception:
            return []

    def normalize(self, raw: Dict[str, Any]) -> UnifiedProduct:
        """Normalize raw Morrisons productEntity into UnifiedProduct."""
        product_id = str(raw.get("productId") or raw.get("retailerProductId") or raw.get("sku") or raw.get("id") or "")
        title = raw.get("name") or "Unknown Product"
        brand = raw.get("brand") or "Morrisons"

        # Pricing
        price_obj = raw.get("price", {}) or {}
        current_price = price_obj.get("current", {}) or {}
        price = float(current_price.get("amount") or 0.0)

        # Unit price
        unit_price: Optional[float] = None
        unit_measure: Optional[str] = None
        unit_obj = price_obj.get("unit", {}) or {}
        if unit_obj:
            unit_cur = unit_obj.get("current", {}) or {}
            unit_amt = unit_cur.get("amount")
            unit_curr = unit_cur.get("currency")
            if unit_amt:
                amt = float(unit_amt)
                unit_price = amt / 100.0 if unit_curr == "GBX" else amt
            unit_label = unit_obj.get("label") or ""
            if "each" in unit_label.lower():
                unit_measure = "each"
            elif "kg" in unit_label.lower():
                unit_measure = "kg"
            elif "litre" in unit_label.lower() or "ltr" in unit_label.lower():
                unit_measure = "litre"

        # Package size parsing from title
        package_size: Optional[float] = None
        package_unit: Optional[str] = None
        package_display: Optional[str] = None

        size_match = re.search(r'(\d+(?:\.\d+)?)\s*(kg|g|litre|ltr|l|ml|pints?|pt)\b', title, re.I)
        if size_match:
            package_size = float(size_match.group(1))
            package_unit = size_match.group(2).lower()
            package_display = f"{size_match.group(1)}{package_unit}"

        # Promotions & deals
        deal: Optional[Dict[str, Any]] = None
        promotions = raw.get("promotions")
        if isinstance(promotions, list) and promotions:
            p0 = promotions[0]
            desc = p0.get("name") or p0.get("description") or ""
            if desc:
                deal = {
                    "description": desc,
                    "type": "multibuy",
                    "raw": desc
                }

        in_stock = raw.get("status") != "OUT_OF_STOCK"
        images = raw.get("images") or {}
        image_url = images.get("default") or raw.get("image")
        product_url = f"https://groceries.morrisons.com/products/{product_id}" if product_id else None

        return UnifiedProduct(
            id=product_id,
            supermarket="morrisons",
            title=title,
            brand=brand,
            price=price,
            unitPrice=unit_price,
            unitPriceMeasure=unit_measure,
            packageSize=package_size,
            packageUnit=package_unit,
            packageDisplay=package_display,
            deal=deal,
            inStock=in_stock,
            productUrl=product_url,
            imageUrl=image_url,
            source="direct"
        )
