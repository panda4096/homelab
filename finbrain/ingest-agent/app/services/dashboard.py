from __future__ import annotations

from app.schemas import DashboardSnapshot


def dashboard_context(snapshot: DashboardSnapshot) -> dict:
    return {
        "snapshot": snapshot,
        "currency_count": len(snapshot.currencies),
        "review_alerts": [alert for alert in snapshot.alerts if alert.code == "pending_reviews"],
    }
