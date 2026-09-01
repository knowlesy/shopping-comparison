"""
Unified Product Schema for ShoppingWise Store Fetcher.
Single-sourced schema definition matching Node pipeline conventions.
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

SCHEMA_VERSION = "1.0.0"


class UnifiedProduct(BaseModel):
    """
    Unified product model representing a normalised grocery item
    from any UK supermarket adapter.
    """
    schemaVersion: str = Field(default=SCHEMA_VERSION, description="Unified schema version stamp")
    id: str = Field(..., description="Unique product ID from retailer")
    supermarket: str = Field(..., description="Supermarket identifier (e.g. 'tesco', 'sainsburys')")
    title: str = Field(..., description="Full clean product title")
    brand: Optional[str] = Field(None, description="Product brand name if available")
    price: float = Field(..., description="Current standard purchase price in GBP (£)")
    unitPrice: Optional[float] = Field(None, description="Price per unit measure in GBP (£)")
    unitPriceMeasure: Optional[str] = Field(None, description="Unit measure (e.g. '100g', 'kg', 'l', 'each')")
    packageSize: Optional[float] = Field(None, description="Numeric package size amount (e.g. 500, 1.5)")
    packageUnit: Optional[str] = Field(None, description="Package unit (e.g. 'g', 'kg', 'ml', 'l')")
    packageDisplay: Optional[str] = Field(None, description="Original raw package display string (e.g. '500g')")
    deal: Optional[Dict[str, Any]] = Field(None, description="Active multibuy/bundle promotion details")
    clubcardPrice: Optional[float] = Field(None, description="Tesco Clubcard promotional price in GBP (£)")
    nectarPrice: Optional[float] = Field(None, description="Sainsbury's Nectar promotional price in GBP (£)")
    inStock: bool = Field(default=True, description="Whether product is currently available in stock")
    productUrl: Optional[str] = Field(None, description="Direct URL to product on retailer website")
    imageUrl: Optional[str] = Field(None, description="Product image URL")
    source: str = Field(default="direct", description="Data source tier indicator ('direct')")
