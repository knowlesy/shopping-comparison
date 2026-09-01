"""
Asda Supermarket Direct Fetch Adapter.
Asda uses a client-side Single Page Application (Salesforce Commerce Cloud)
whose server-rendered search page is an empty shell with no product data.
Direct stateless HTTP extraction is declared unreachable.
"""

from typing import List, Dict, Any, Optional
try:
    from .base import BaseAdapter, AdapterCapabilities
    from ..schema import UnifiedProduct
except (ImportError, ValueError):
    from adapters.base import BaseAdapter, AdapterCapabilities
    from schema import UnifiedProduct


class AsdaAdapter(BaseAdapter):
    """
    Direct adapter for Asda supermarket.
    Declared unreachable for direct stateless HTTP extraction due to client-side SPA.
    """
    store_name: str = "asda"

    @property
    def capabilities(self) -> Dict[str, Any]:
        return AdapterCapabilities(
            variants=False,
            loyalty_price=False,
            deal_strings=False,
            unit_price=False,
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
        Asda direct stateless search is currently unreachable without full browser execution
        due to client-side SPA hydration. Returns empty list to fall through gracefully.
        """
        return []

    def normalize(self, raw: Dict[str, Any]) -> UnifiedProduct:
        """Fallback normalizer if raw payload is provided."""
        item_id = str(raw.get("id") or raw.get("cin") or "")
        title = raw.get("name") or raw.get("title") or "Unknown Asda Item"
        price = float(raw.get("price") or 0.0)

        return UnifiedProduct(
            id=item_id,
            supermarket="asda",
            title=title,
            brand=raw.get("brand") or "Asda",
            price=price,
            source="direct"
        )
