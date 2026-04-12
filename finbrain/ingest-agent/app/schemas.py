from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class FeeBreakdown(BaseModel):
    exchange_levy: Decimal = Decimal("0")
    trading_fee: Decimal = Decimal("0")
    broker_commission: Decimal = Decimal("0")
    other: Decimal = Decimal("0")

    def total(self) -> Decimal:
        return self.exchange_levy + self.trading_fee + self.broker_commission + self.other


class ActivityCreate(BaseModel):
    source: str
    source_ref: str
    broker_account: str
    trade_date: date
    settle_date: date | None = None
    type: str
    symbol: str
    quantity: Decimal
    unit_price: Decimal
    currency: str
    fees: FeeBreakdown = Field(default_factory=FeeBreakdown)
    settlement_amount: Decimal
    raw_payload: dict[str, Any] = Field(default_factory=dict)
    raw_doc_uri: str | None = None
    wealth_product_code: str | None = None
    review_required: bool | None = None


class ActivityBatchRequest(BaseModel):
    activities: list[ActivityCreate]


class ActivityRead(BaseModel):
    id: int
    source: str
    source_ref: str
    broker_account: str
    trade_date: date
    settle_date: date | None
    type: str
    symbol: str
    quantity: Decimal
    unit_price: Decimal
    currency: str
    fees: FeeBreakdown
    settlement_amount: Decimal
    raw_payload: dict[str, Any]
    raw_doc_uri: str | None
    wealth_product_code: str | None
    review_required: bool
    review_status: str
    dispatch_status: str
    dispatch_error: str | None
    created_at: datetime


class ActivityBatchResult(BaseModel):
    inserted: int
    duplicates: int
    review_required: int
    ids: list[int]


class WealthProductCreate(BaseModel):
    product_code: str
    name: str
    issuer: str
    currency: str
    principal: Decimal
    start_date: date
    maturity_date: date
    expected_yield: Decimal | None = None
    actual_yield: Decimal | None = None
    type: str
    underlying: str | None = None
    is_principal_protected: bool = True
    status: str = "ACTIVE"
    notes: str | None = None


class WealthProductRead(WealthProductCreate):
    id: int
    created_at: datetime


class DashboardCurrencyCard(BaseModel):
    currency: str
    amount: Decimal
    source: str


class DashboardCategoryCard(BaseModel):
    name: str
    currency: str
    amount: Decimal
    source: str


class DashboardMaturityItem(BaseModel):
    product_code: str
    name: str
    currency: str
    principal: Decimal
    maturity_date: date
    status: str


class DashboardImportItem(BaseModel):
    source: str
    source_ref: str
    broker_account: str
    type: str
    symbol: str
    created_at: datetime
    review_required: bool
    dispatch_status: str


class DashboardAlert(BaseModel):
    code: str
    level: str
    message: str


class DashboardSnapshot(BaseModel):
    currencies: list[DashboardCurrencyCard]
    categories: list[DashboardCategoryCard]
    maturity_calendar: list[DashboardMaturityItem]
    recent_imports: list[DashboardImportItem]
    alerts: list[DashboardAlert]


class ParsedFutuRow(BaseModel):
    activity: ActivityCreate
    anomalies: list[str] = Field(default_factory=list)


class FutuCsvParseResponse(BaseModel):
    parsed: list[ParsedFutuRow]
