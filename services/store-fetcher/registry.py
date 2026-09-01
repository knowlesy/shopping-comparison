"""
Supermarket Adapter Registry for ShoppingWise Store Fetcher.
Declares all seven UK supermarkets and their adapter implementations or unsupported status.
"""

from typing import Dict, Any, Type, Optional
try:
    from .adapters.base import BaseAdapter
    from .adapters.tesco import TescoAdapter
    from .adapters.sainsburys import SainsburysAdapter
    from .adapters.morrisons import MorrisonsAdapter
    from .adapters.asda import AsdaAdapter
    from .adapters.iceland import IcelandAdapter
except (ImportError, ValueError):
    from adapters.base import BaseAdapter
    from adapters.tesco import TescoAdapter
    from adapters.sainsburys import SainsburysAdapter
    from adapters.morrisons import MorrisonsAdapter
    from adapters.asda import AsdaAdapter
    from adapters.iceland import IcelandAdapter


STORE_REGISTRY: Dict[str, Dict[str, Any]] = {
    "tesco": {
        "name": "Tesco",
        "supported": True,
        "adapter_class": TescoAdapter,
        "status": "reachable",
        "notes": "Direct HTTP extraction with Apollo cache & xapi.tesco.com gateway"
    },
    "sainsburys": {
        "name": "Sainsbury's",
        "supported": True,
        "adapter_class": SainsburysAdapter,
        "status": "reachable",
        "notes": "Direct REST extraction via GOL API with Nectar pricing"
    },
    "morrisons": {
        "name": "Morrisons",
        "supported": True,
        "adapter_class": MorrisonsAdapter,
        "status": "reachable",
        "notes": "Direct HTTP extraction via server-rendered window.__INITIAL_STATE__"
    },
    "asda": {
        "name": "Asda",
        "supported": False,
        "adapter_class": AsdaAdapter,
        "status": "unreachable",
        "reason": "unsupported: Server returns client-side SPA shell without embedded product data"
    },
    "iceland": {
        "name": "Iceland",
        "supported": False,
        "adapter_class": IcelandAdapter,
        "status": "unreachable",
        "reason": "unsupported: Server returns client-side PWA shell with unpopulated productsById"
    },
    "aldi": {
        "name": "Aldi",
        "supported": False,
        "adapter_class": None,
        "status": "unsupported",
        "reason": "unsupported: No UK online grocery platform — estimated data only (Click & Collect discontinued)"
    },
    "lidl": {
        "name": "Lidl",
        "supported": False,
        "adapter_class": None,
        "status": "unsupported",
        "reason": "unsupported: No UK online grocery platform — in-store shopping only (estimated data only)"
    }
}


def get_adapter(store_name: str) -> Optional[BaseAdapter]:
    """Retrieve an instantiated adapter for the specified store name."""
    entry = STORE_REGISTRY.get(store_name.lower().strip())
    if not entry or not entry.get("adapter_class"):
        return None
    cls: Type[BaseAdapter] = entry["adapter_class"]
    return cls()
