"""
Asda Supermarket Direct Fetch Adapter.
Asda uses a client-side Single Page Application (Salesforce Commerce Cloud)
whose server-rendered search page is an empty shell with no product data.
Provides a Tier 2 Camoufox stealth browser rendering path for dynamic execution.
"""

from typing import List, Dict, Any, Optional
try:
    from .base import BaseAdapter, AdapterCapabilities
    from ..schema import UnifiedProduct
    from ..browser import browser_service
except (ImportError, ValueError):
    from adapters.base import BaseAdapter, AdapterCapabilities
    from schema import UnifiedProduct
    from browser import browser_service


class AsdaAdapter(BaseAdapter):
    """
    Direct adapter for Asda supermarket.
    Supports Tier 2 Camoufox stealth browser fallback.
    """
    store_name: str = "asda"

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
        want_variants: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Asda search via Tier 2 Camoufox browser rendering.
        If browser execution is unavailable or exceeds sidecar politeness boundaries,
        returns empty list to fall through gracefully to aggregator/catalog.
        """
        if not browser_service.is_available():
            return []

        search_url = f"https://groceries.asda.com/search/{query.strip()}"
        res = browser_service.render_page(
            search_url,
            wait_until="domcontentloaded",
            timeout_ms=30000,
            wait_ms=2500,
            wait_for_selector='a[href*="/product/"]',
            extract_ld_json=True
        )

        if not res.get("success"):
            return []

        # Return extracted ld_json products if available
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
        """Normalizes Asda raw product payload (Algolia, schema.org, or DOM) into UnifiedProduct."""
        item_id = str(raw.get("id") or raw.get("ID") or raw.get("cin") or raw.get("CIN") or "")
        title = raw.get("name") or raw.get("NAME") or raw.get("title") or "Unknown Asda Item"
        
        # Price extraction supporting multiple shapes
        price = 0.0
        if "PRICES" in raw and isinstance(raw["PRICES"], dict):
            en_price = raw["PRICES"].get("EN", {})
            price = float(en_price.get("PRICE") or 0.0)
        elif "price" in raw:
            price = float(raw.get("price") or 0.0)
        elif "offers" in raw and isinstance(raw["offers"], dict):
            offer = raw["offers"]
            if "priceSpecification" in offer and isinstance(offer["priceSpecification"], dict):
                price = float(offer["priceSpecification"].get("price") or 0.0)
            elif "price" in offer:
                price = float(offer.get("price") or 0.0)

        # Unit price
        unit_price = None
        unit_price_measure = None
        if "PRICES" in raw and isinstance(raw["PRICES"], dict):
            en_price = raw["PRICES"].get("EN", {})
            unit_price = float(en_price.get("PRICEPERUOM") or 0.0) if en_price.get("PRICEPERUOM") else None
            formatted = en_price.get("PRICEPERUOMFORMATTED") or ""
            if "/" in formatted:
                unit_price_measure = formatted.split("/")[1].strip().lower()

        # Taxonomy
        super_dept = None
        dept = None
        aisle = None
        shelf = None
        tax = raw.get("PRIMARY_TAXONOMY") or {}
        if isinstance(tax, dict):
            super_dept = tax.get("CAT_NAME")
            dept = tax.get("DEPT_NAME")
            aisle = tax.get("AISLE_NAME")
            shelf = tax.get("SHELF_NAME")

        return UnifiedProduct(
            id=item_id,
            supermarket="asda",
            title=title,
            brand=raw.get("brand") or raw.get("BRAND") or "ASDA",
            price=price,
            unitPrice=unit_price,
            unitPriceMeasure=unit_price_measure,
            superDepartmentName=super_dept,
            departmentName=dept,
            aisleName=aisle,
            shelfName=shelf,
            source="direct"
        )
