from __future__ import annotations

from app.schemas import ActivityCreate


def build_dividend_transaction(activity: ActivityCreate, destination_account: str) -> dict:
    return {
        "type": "deposit",
        "description": f"Dividend {activity.symbol}",
        "amount": str(activity.settlement_amount),
        "currency_code": activity.currency,
        "date": activity.trade_date.isoformat(),
        "destination_name": destination_account,
        "notes": activity.source_ref,
    }


def build_wealth_transfer(
    *,
    amount: str,
    currency: str,
    source_account: str,
    destination_account: str,
    description: str,
    reference: str,
    date_value: str,
) -> dict:
    return {
        "type": "transfer",
        "description": description,
        "amount": amount,
        "currency_code": currency,
        "date": date_value,
        "source_name": source_account,
        "destination_name": destination_account,
        "notes": reference,
    }
