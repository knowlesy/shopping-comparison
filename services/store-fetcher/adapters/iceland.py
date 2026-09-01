"""
Iceland Supermarket Direct Fetch Adapter.
Iceland uses a Mobify PWA shell with client-side Algolia search integration.
The server-rendered search page leaves productsById empty in the initial state.
Direct stateless HTTP extraction is declared unreachable.
"""

from typing import List, Dict, Any, Optional
try:
    from .base import BaseAdapter, AdapterCapabilities
    from ..schema import UnifiedProduct
except (ImportError, ValueError):
    from adapters.base import BaseAdapter, AdapterCapabilities
    from schema import UnifiedProduct


class IcelandAdapter(BaseAdapter):
    """
    Direct adapter for Iceland supermarket.
    Declared unreachable for direct stateless HTTP extraction due to client-side Algolia search.
    """
    store_name: str = "iceland"

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
        Iceland search requires client-side Algolia execution.
        Returns empty list to fall through gracefully to aggregator/catalog.
        """
        return []

    def normalize(self, raw: Dict[str, Any]) -> UnifiedProduct:
        """Fallback normalizer if raw payload is provided."""
        item_id = str(raw.get("id") or raw.get("sku") or "")
        title = raw.get("name") or raw.get("title") or "Unknown Iceland Item"
        price = float(raw.get("price") or 0.0)

        return UnifiedProduct(
            id=item_id,
            supermarket="iceland",
            title=title,
            brand=raw.get("brand") or "Iceland",
            price=price,
            source="direct"
        )
