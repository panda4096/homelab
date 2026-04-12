from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from sqlmodel import Session, select

from app.models import ActivityRecord, WealthProduct
from app.schemas import (
    ActivityBatchResult,
    ActivityCreate,
    DashboardAlert,
    DashboardCategoryCard,
    DashboardCurrencyCard,
    DashboardImportItem,
    DashboardMaturityItem,
    DashboardSnapshot,
    WealthProductCreate,
)


def default_review_required(source: str) -> bool:
    return source == "hsbc_pdf"


def ingest_activities(session: Session, activities: list[ActivityCreate]) -> ActivityBatchResult:
    """Ingest a batch of activities with idempotent dedup and single-transaction semantics.

    A batch either commits in full or rolls back in full. Duplicates detected by
    `(source, source_ref)` are counted but do not prevent the batch from
    committing; any database or validation error while constructing / staging
    records causes the whole batch to roll back, leaving the database untouched.

    The returned `ids` list has the same length and order as `activities`:
    duplicate positions are filled with the existing row id, newly inserted
    positions are filled with the freshly assigned id after commit.
    """

    inserted = 0
    duplicates = 0
    review_required_count = 0
    # Staged new rows and the index in `activities` they correspond to, so we
    # can splice their post-commit ids back into the output slot ordering.
    new_records: list[tuple[int, ActivityRecord]] = []
    ids: list[int | None] = [None] * len(activities)

    try:
        for idx, activity in enumerate(activities):
            existing = session.exec(
                select(ActivityRecord).where(
                    ActivityRecord.source == activity.source,
                    ActivityRecord.source_ref == activity.source_ref,
                )
            ).first()
            if existing:
                duplicates += 1
                ids[idx] = existing.id or 0
                continue

            review_required = (
                activity.review_required
                if activity.review_required is not None
                else default_review_required(activity.source)
            )
            if review_required:
                review_required_count += 1

            record = ActivityRecord(
                source=activity.source,
                source_ref=activity.source_ref,
                broker_account=activity.broker_account,
                trade_date=activity.trade_date,
                settle_date=activity.settle_date,
                type=activity.type,
                symbol=activity.symbol,
                quantity=activity.quantity,
                unit_price=activity.unit_price,
                currency=activity.currency,
                fees=activity.fees.model_dump(mode="json"),
                settlement_amount=activity.settlement_amount,
                raw_payload=activity.raw_payload,
                raw_doc_uri=activity.raw_doc_uri,
                wealth_product_code=activity.wealth_product_code,
                review_required=review_required,
            )
            session.add(record)
            new_records.append((idx, record))
            inserted += 1

        session.commit()
    except Exception:
        session.rollback()
        raise

    for idx, record in new_records:
        session.refresh(record)
        ids[idx] = record.id or 0

    return ActivityBatchResult(
        inserted=inserted,
        duplicates=duplicates,
        review_required=review_required_count,
        ids=[i if i is not None else 0 for i in ids],
    )


def list_review_queue(session: Session) -> list[ActivityRecord]:
    statement = (
        select(ActivityRecord)
        .where(
            ActivityRecord.review_required.is_(True),
            ActivityRecord.review_status == "PENDING",
        )
        .order_by(ActivityRecord.created_at.desc())
    )
    return list(session.exec(statement).all())


def list_recent_activities(session: Session, limit: int = 10) -> list[ActivityRecord]:
    statement = select(ActivityRecord).order_by(ActivityRecord.created_at.desc()).limit(limit)
    return list(session.exec(statement).all())


def create_wealth_product(session: Session, payload: WealthProductCreate) -> WealthProduct:
    existing = session.exec(
        select(WealthProduct).where(WealthProduct.product_code == payload.product_code)
    ).first()
    if existing:
        return existing

    product = WealthProduct(**payload.model_dump())
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


def list_wealth_products(session: Session) -> list[WealthProduct]:
    statement = select(WealthProduct).order_by(WealthProduct.maturity_date.asc())
    return list(session.exec(statement).all())


def dashboard_snapshot(session: Session) -> DashboardSnapshot:
    """Phase 0 placeholder implementation.

    ``currency_totals`` is currently just an arithmetic sum over the most
    recent 50 activities' ``settlement_amount``. Because BUY/DIVIDEND/FEE have
    opposite sign semantics, the running sum **does not represent any
    meaningful balance** — it only exists so that the API contract can be
    exercised end-to-end. ``cash`` / ``liabilities`` are hard-coded to zero
    HKD with source tag ``pending-firefly-integration``.

    The real aggregation will be rewritten in Phase 1 once we wire this
    function up to the Firefly III API. Until then the only "true" sections of
    the snapshot are ``maturity_calendar``, ``recent_imports`` and ``alerts``;
    ``currencies`` / ``categories`` should be ignored by any UI that cares
    about correctness.
    """
    activities = list_recent_activities(session, limit=50)
    wealth_products = list_wealth_products(session)

    currency_totals: dict[str, Decimal] = {}
    securities_by_currency: dict[str, Decimal] = {}
    wealth_by_currency: dict[str, Decimal] = {}

    for activity in activities:
        currency_totals.setdefault(activity.currency, Decimal("0"))
        currency_totals[activity.currency] += activity.settlement_amount
        if activity.type in {"BUY", "SELL", "DIVIDEND", "FEE", "INTEREST", "LIABILITY"}:
            securities_by_currency.setdefault(activity.currency, Decimal("0"))
            securities_by_currency[activity.currency] += activity.settlement_amount

    for product in wealth_products:
        wealth_by_currency.setdefault(product.currency, Decimal("0"))
        if product.status.upper() == "ACTIVE":
            wealth_by_currency[product.currency] += product.principal

    currencies = [
        DashboardCurrencyCard(currency=currency, amount=amount, source="ingest-agent")
        for currency, amount in sorted(currency_totals.items())
    ]

    categories = [
        DashboardCategoryCard(
            name="cash",
            currency="HKD",
            amount=Decimal("0"),
            source="pending-firefly-integration",
        ),
        DashboardCategoryCard(
            name="liabilities",
            currency="HKD",
            amount=Decimal("0"),
            source="pending-firefly-integration",
        ),
    ]
    categories.extend(
        DashboardCategoryCard(
            name="securities",
            currency=currency,
            amount=amount,
            source="ingest-agent-local",
        )
        for currency, amount in sorted(securities_by_currency.items())
    )
    categories.extend(
        DashboardCategoryCard(
            name="wealth",
            currency=currency,
            amount=amount,
            source="wealth-products",
        )
        for currency, amount in sorted(wealth_by_currency.items())
    )

    upcoming_cutoff = date.today() + timedelta(days=90)
    maturity_calendar = [
        DashboardMaturityItem(
            product_code=product.product_code,
            name=product.name,
            currency=product.currency,
            principal=product.principal,
            maturity_date=product.maturity_date,
            status=product.status,
        )
        for product in wealth_products
        if product.maturity_date <= upcoming_cutoff
    ]

    recent_imports = [
        DashboardImportItem(
            source=activity.source,
            source_ref=activity.source_ref,
            broker_account=activity.broker_account,
            type=activity.type,
            symbol=activity.symbol,
            created_at=activity.created_at,
            review_required=activity.review_required,
            dispatch_status=activity.dispatch_status,
        )
        for activity in activities[:10]
    ]

    review_queue_count = len(list_review_queue(session))
    failed_dispatch_count = len([item for item in activities if item.dispatch_status == "FAILED"])
    alerts = [
        DashboardAlert(
            code="pending_reviews",
            level="warning",
            message=f"{review_queue_count} activity records require review",
        )
    ]
    if failed_dispatch_count:
        alerts.append(
            DashboardAlert(
                code="dispatch_failed",
                level="critical",
                message=f"{failed_dispatch_count} activity records failed dispatch",
            )
        )

    return DashboardSnapshot(
        currencies=currencies,
        categories=categories,
        maturity_calendar=maturity_calendar,
        recent_imports=recent_imports,
        alerts=alerts,
    )
