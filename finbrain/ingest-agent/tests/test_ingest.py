from decimal import Decimal

import pytest


def _hsbc_activity(source_ref: str) -> dict:
    return {
        "source": "hsbc_pdf",
        "source_ref": source_ref,
        "broker_account": "HSBC HK",
        "trade_date": "2026-04-10",
        "settle_date": "2026-04-12",
        "type": "BUY",
        "symbol": "0700.HK",
        "quantity": "100",
        "unit_price": "320.50",
        "currency": "HKD",
        "fees": {
            "exchange_levy": "1.25",
            "trading_fee": "2.50",
            "broker_commission": "18.00",
            "other": "0.00",
        },
        "settlement_amount": "32071.75",
        "raw_payload": {"doc": "sample"},
    }


def test_ingest_is_idempotent_and_routes_hsbc_to_review(client):
    payload = {
        "activities": [
            _hsbc_activity("HSBC-1"),
            _hsbc_activity("HSBC-1"),
        ]
    }

    response = client.post("/api/v1/activities", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["inserted"] == 1
    assert body["duplicates"] == 1
    assert body["review_required"] == 1
    # ids slots correspond 1:1 with input order; second slot is the duplicate
    # that resolved to the first slot's row.
    assert len(body["ids"]) == 2
    assert body["ids"][0] == body["ids"][1]

    reviews = client.get("/api/v1/reviews")
    assert reviews.status_code == 200
    assert len(reviews.json()) == 1
    assert reviews.json()[0]["source_ref"] == "HSBC-1"


def test_ingest_batch_rolls_back_all_on_mid_batch_failure(client, monkeypatch):
    # First, seed one unrelated row successfully so we can prove rollback only
    # affects the failing batch, not the prior state.
    seed = client.post(
        "/api/v1/activities",
        json={"activities": [_hsbc_activity("SEED-1")]},
    )
    assert seed.status_code == 200
    assert seed.json()["inserted"] == 1

    # Intercept session.add() so the second ActivityRecord in the next batch
    # fails mid-loop. This simulates any kind of DB-layer error that could
    # occur after earlier rows have already been staged.
    from sqlmodel import Session

    real_add = Session.add
    call_count = {"n": 0}

    def exploding_add(self, instance, *args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("simulated mid-batch failure")
        return real_add(self, instance, *args, **kwargs)

    monkeypatch.setattr(Session, "add", exploding_add)

    payload = {
        "activities": [
            _hsbc_activity("BATCH-A"),
            _hsbc_activity("BATCH-B"),
            _hsbc_activity("BATCH-C"),
        ]
    }

    with pytest.raises(RuntimeError, match="simulated mid-batch failure"):
        client.post("/api/v1/activities", json=payload)

    # Restore the original so subsequent queries use the real Session.add.
    monkeypatch.setattr(Session, "add", real_add)

    # Reviews reflect only the original SEED row — none of BATCH-A/B/C landed.
    reviews = client.get("/api/v1/reviews").json()
    source_refs = {row["source_ref"] for row in reviews}
    assert source_refs == {"SEED-1"}
