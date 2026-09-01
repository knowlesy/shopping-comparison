"""
Supermarket adapters package.
Declares all supermarket adapters including unsupported discounters (Aldi/Lidl).
"""

from .base import BaseAdapter, AdapterCapabilities
from .tesco import TescoAdapter
from .sainsburys import SainsburysAdapter
from .morrisons import MorrisonsAdapter
from .asda import AsdaAdapter
from .iceland import IcelandAdapter

UNSUPPORTED_DISCOUNTERS = {
    "aldi": "unsupported: No UK online grocery platform — estimated data only (Click & Collect discontinued)",
    "lidl": "unsupported: No UK online grocery platform — in-store shopping only (estimated data only)"
}

__all__ = [
    "BaseAdapter",
    "AdapterCapabilities",
    "TescoAdapter",
    "SainsburysAdapter",
    "MorrisonsAdapter",
    "AsdaAdapter",
    "IcelandAdapter",
    "UNSUPPORTED_DISCOUNTERS"
]
