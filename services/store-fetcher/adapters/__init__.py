"""
Supermarket adapters package.
"""

from .base import BaseAdapter, AdapterCapabilities
from .tesco import TescoAdapter
from .sainsburys import SainsburysAdapter

__all__ = ["BaseAdapter", "AdapterCapabilities", "TescoAdapter", "SainsburysAdapter"]
