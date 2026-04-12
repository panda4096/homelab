from __future__ import annotations

from app.schemas import ActivityCreate


def build_import_payload(activity: ActivityCreate, account_id: str, data_source: str = "MANUAL") -> dict:
    return {
        "activities": [
            {
                "accountId": account_id,
                "currency": activity.currency,
                "dataSource": data_source,
                "date": activity.trade_date.isoformat(),
                "fee": float(activity.fees.total()),
                "quantity": float(activity.quantity),
                "symbol": activity.symbol,
                "type": activity.type,
                "unitPrice": float(activity.unit_price),
                "comment": activity.source_ref,
            }
        ]
    }
