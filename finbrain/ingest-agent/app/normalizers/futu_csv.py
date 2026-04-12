from __future__ import annotations

from decimal import Decimal, InvalidOperation

from app.schemas import ActivityCreate, FeeBreakdown


REQUIRED_FIELDS = {
    "source_ref",
    "broker_account",
    "trade_date",
    "type",
    "symbol",
    "quantity",
    "unit_price",
    "currency",
    "settlement_amount",
}


def _to_decimal(value: str, field_name: str) -> Decimal:
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"invalid decimal in {field_name}: {value}") from exc


def normalize_row(row: dict[str, str]) -> tuple[ActivityCreate, list[str]]:
    anomalies: list[str] = []
    missing = sorted(field for field in REQUIRED_FIELDS if not row.get(field))
    if missing:
        anomalies.append(f"missing_fields:{','.join(missing)}")

    fees = FeeBreakdown(
        exchange_levy=_to_decimal(row.get("exchange_levy", "0"), "exchange_levy"),
        trading_fee=_to_decimal(row.get("trading_fee", "0"), "trading_fee"),
        broker_commission=_to_decimal(row.get("broker_commission", "0"), "broker_commission"),
        other=_to_decimal(row.get("other", "0"), "other"),
    )

    if fees.total() > Decimal("1000"):
        anomalies.append("fees_over_threshold")

    settlement_amount = _to_decimal(row.get("settlement_amount", "0"), "settlement_amount")
    if settlement_amount == Decimal("0"):
        anomalies.append("zero_settlement_amount")

    activity = ActivityCreate(
        source="futu_csv",
        source_ref=row.get("source_ref", ""),
        broker_account=row.get("broker_account", ""),
        trade_date=row.get("trade_date", ""),
        settle_date=row.get("settle_date") or None,
        type=row.get("type", ""),
        symbol=row.get("symbol", ""),
        quantity=_to_decimal(row.get("quantity", "0"), "quantity"),
        unit_price=_to_decimal(row.get("unit_price", "0"), "unit_price"),
        currency=row.get("currency", ""),
        fees=fees,
        settlement_amount=settlement_amount,
        raw_payload=row,
        review_required=bool(anomalies),
    )
    return activity, anomalies
