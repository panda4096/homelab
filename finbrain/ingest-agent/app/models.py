from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy import Column, JSON, Numeric, UniqueConstraint
from sqlmodel import Field, SQLModel


class ActivityType(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    DIVIDEND = "DIVIDEND"
    FEE = "FEE"
    INTEREST = "INTEREST"
    LIABILITY = "LIABILITY"


class ActivitySource(str, Enum):
    HSBC_PDF = "hsbc_pdf"
    FUTU_CSV = "futu_csv"
    FUTU_OPENAPI = "futu_openapi"


class ReviewStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class DispatchStatus(str, Enum):
    PENDING = "PENDING"
    DISPATCHED = "DISPATCHED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ActivityRecord(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("source", "source_ref", name="uq_activity_source_ref"),
    )

    id: int | None = Field(default=None, primary_key=True)
    source: str = Field(index=True)
    source_ref: str = Field(index=True)
    broker_account: str
    trade_date: date
    settle_date: date | None = None
    type: str = Field(index=True)
    symbol: str
    quantity: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(20, 8)))
    unit_price: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(20, 8)))
    currency: str = Field(index=True)
    fees: dict[str, str] = Field(default_factory=dict, sa_column=Column(JSON))
    settlement_amount: Decimal = Field(
        default=Decimal("0"),
        sa_column=Column(Numeric(20, 8)),
    )
    raw_payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    # Pointer into the uploads volume (FINBRAIN_UPLOADS_DIR). Format:
    # `file:///<source>/<sha256>.<ext>`. `raw_payload` still stores structured
    # summary (OCR text, CSV row dict); this field only points at the original
    # binary document. Nullable so sources that have no binary (e.g. Futu
    # OpenAPI) can leave it unset.
    raw_doc_uri: str | None = Field(default=None, nullable=True)
    # Optional link from a wealth-related activity (SUBSCRIBE / REDEEM /
    # INTEREST on a banking product) to its owning `WealthProduct.product_code`.
    # No foreign-key constraint on purpose: activities may arrive before the
    # product is registered, and `(source, source_ref)` remains the dedup key.
    # Phase 3c's dashboard aggregation will JOIN on this field.
    wealth_product_code: str | None = Field(default=None, index=True, nullable=True)
    review_required: bool = False
    review_status: str = Field(default=ReviewStatus.PENDING.value, index=True)
    dispatch_status: str = Field(default=DispatchStatus.PENDING.value, index=True)
    dispatch_error: str | None = None
    created_at: datetime = Field(default_factory=utcnow, index=True)


class WealthProduct(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    product_code: str = Field(index=True, unique=True)
    name: str
    issuer: str
    currency: str = Field(index=True)
    principal: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(20, 8)))
    start_date: date
    maturity_date: date
    expected_yield: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 6)))
    actual_yield: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 6)))
    type: str = Field(index=True)
    underlying: str | None = None
    is_principal_protected: bool = True
    status: str = Field(default="ACTIVE", index=True)
    notes: str | None = None
    created_at: datetime = Field(default_factory=utcnow, index=True)
