"""
Sainsbury's Supermarket Direct Fetch Adapter.
Implements direct extraction against Sainsbury's GOL REST API
with Nectar price support and product normalization.
"""

import re
from typing import List, Dict, Any, Optional
try:
    from .base import BaseAdapter, AdapterCapabilities
    from ..schema import UnifiedProduct
except (ImportError, ValueError):
    from adapters.base import BaseAdapter, AdapterCapabilities
    from schema import UnifiedProduct

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    cffi_requests = None


class SainsburysAdapter(BaseAdapter):
    """Direct adapter for Sainsbury's supermarket."""
    store_name: str = "sainsburys"

    BASE_URL = "https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/product"

    @property
    def capabilities(self) -> Dict[str, Any]:
        return AdapterCapabilities(
            variants=True,
            loyalty_price=True,  # Nectar pricing
            deal_strings=True,
            unit_price=True,
            stock=True,
            direct_http=True
        ).to_dict()

    def _get_session(self):
        if not cffi_requests:
            raise RuntimeError("curl_cffi is required for SainsburysAdapter")
        return cffi_requests.Session(impersonate="chrome124")

    def search(
        self,
        query: str,
        *,
        target_quantity: Optional[float] = None,
        want_variants: bool = False
    ) -> List[Dict[str, Any]]:
        """Search products on Sainsbury's GOL REST service."""
        session = self._get_session()
        headers = {
            "accept": "application/json",
            "accept-language": "en-GB,en;q=0.9",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        }
        params = {
            "filter[keyword]": query,
            "page_number": "1",
            "page_size": "24"
        }

        res = session.get(self.BASE_URL, headers=headers, params=params, timeout=10)
        if res.status_code != 200:
            return []

        try:
            data = res.json()
            return data.get("products", [])
        except Exception:
            return []

    def normalize(self, raw: Dict[str, Any]) -> UnifiedProduct:
        """Normalize raw Sainsbury's product into UnifiedProduct."""
        product_id = str(raw.get("product_uid") or raw.get("sainId") or "")
        title = raw.get("name") or "Unknown Product"
        brand = raw.get("brand") or (title.split()[0] if title else None)

        retail_price = raw.get("retail_price", {}) or {}
        price = float(retail_price.get("price") or 0.0)

        unit_info = raw.get("unit_price", {}) or {}
        unit_price = float(unit_info.get("price")) if unit_info.get("price") is not None else None
        unit_measure = unit_info.get("measure")

        # Package size parsing
        package_size: Optional[float] = None
        package_unit: Optional[str] = None
        package_display: Optional[str] = None

        size_match = re.search(r'(\d+(?:\.\d+)?)\s*(kg|g|litre|ltr|l|ml|pints?|pt)\b', title, re.I)
        if size_match:
            package_size = float(size_match.group(1))
            package_unit = size_match.group(2).lower()
            package_display = f"{size_match.group(1)}{package_unit}"

        # Nectar loyalty price and promotions
        nectar_price: Optional[float] = None
        deal: Optional[Dict[str, Any]] = None

        promotions = raw.get("promotions") or []
        for promo in promotions:
            promo_title = promo.get("strap_line") or promo.get("original_strap_line") or ""
            if "nectar" in promo_title.lower():
                # Extract Nectar price if present
                m = re.search(r'£(\d+(?:\.\d+)?)', promo_title)
                if m:
                    nectar_price = float(m.group(1))
                deal = {
                    "description": promo_title,
                    "type": "nectar",
                    "raw": promo_title
                }
                break
            elif promo_title:
                deal = {
                    "description": promo_title,
                    "type": "multibuy",
                    "raw": promo_title
                }

        in_stock = bool(raw.get("is_available", True))
        image_url = raw.get("image")
        full_url = raw.get("full_url")
        product_url = f"https{full_url}" if full_url and full_url.startswith("://") else full_url

        return UnifiedProduct(
            id=product_id,
            supermarket="sainsburys",
            title=title,
            brand=brand,
            price=price,
            unitPrice=unit_price,
            unitPriceMeasure=unit_measure,
            packageSize=package_size,
            packageUnit=package_unit,
            packageDisplay=package_display,
            deal=deal,
            nectarPrice=nectar_price,
            inStock=in_stock,
            productUrl=product_url,
            imageUrl=image_url,
            source="direct"
        )
