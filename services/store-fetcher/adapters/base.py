"""
Base Adapter Contract for ShoppingWise Store Fetcher.
Every supermarket adapter must inherit from BaseAdapter and implement
the required search, normalize, and capability declaration contract.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from ..schema import UnifiedProduct


class AdapterCapabilities:
    """Declared feature capabilities supported by a supermarket adapter."""
    def __init__(
        self,
        variants: bool = False,
        loyalty_price: bool = False,
        deal_strings: bool = False,
        unit_price: bool = False,
        stock: bool = False,
        direct_http: bool = True
    ):
        self.variants = variants
        self.loyalty_price = loyalty_price
        self.deal_strings = deal_strings
        self.unit_price = unit_price
        self.stock = stock
        self.direct_http = direct_http

    def to_dict(self) -> Dict[str, bool]:
        return {
            "variants": self.variants,
            "loyalty_price": self.loyalty_price,
            "deal_strings": self.deal_strings,
            "unit_price": self.unit_price,
            "stock": self.stock,
            "direct_http": self.direct_http
        }


class BaseAdapter(ABC):
    """
    Abstract Base Class for supermarket direct fetch adapters.
    """
    store_name: str = "base"

    @property
    @abstractmethod
    def capabilities(self) -> Dict[str, Any]:
        """
        Declare what features the retailer adapter supports.
        Must return a dict or AdapterCapabilities declaring:
        variants, loyalty_price, deal_strings, unit_price, stock.
        """
        pass

    @abstractmethod
    def search(
        self,
        query: str,
        *,
        target_quantity: Optional[float] = None,
        want_variants: bool = False
    ) -> List[Any]:
        """
        Perform a search against the supermarket's backend API.
        Returns a list of raw result objects/payloads.
        """
        pass

    @abstractmethod
    def normalize(self, raw: Any) -> UnifiedProduct:
        """
        Normalize a raw store-specific payload/object into a UnifiedProduct.
        If a field is not available from the retailer, omit it (never fabricate).
        """
        pass
