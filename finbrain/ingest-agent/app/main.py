from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlmodel import Session

from app.config import get_settings
from app.db import get_session, init_db
from app.repository import (
    create_wealth_product,
    dashboard_snapshot,
    ingest_activities,
    list_review_queue,
    list_wealth_products,
)
from app.schemas import (
    ActivityBatchRequest,
    ActivityBatchResult,
    ActivityRead,
    DashboardSnapshot,
    FutuCsvParseResponse,
    WealthProductCreate,
    WealthProductRead,
)
from app.services.dashboard import dashboard_context
from app.sources.futu_csv import parse_csv

settings = get_settings()
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="finbrain ingest-agent",
    root_path=settings.normalized_base_path,
    lifespan=lifespan,
)


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    target = f"{settings.normalized_base_path}/dashboard" if settings.normalized_base_path else "/dashboard"
    return RedirectResponse(url=target, status_code=307)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/activities", response_model=ActivityBatchResult)
def post_activities(
    payload: ActivityBatchRequest,
    session: Session = Depends(get_session),
) -> ActivityBatchResult:
    return ingest_activities(session, payload.activities)


@app.get("/api/v1/reviews", response_model=list[ActivityRead])
def get_reviews(session: Session = Depends(get_session)) -> list[ActivityRead]:
    rows = list_review_queue(session)
    return [
        ActivityRead(
            id=row.id or 0,
            source=row.source,
            source_ref=row.source_ref,
            broker_account=row.broker_account,
            trade_date=row.trade_date,
            settle_date=row.settle_date,
            type=row.type,
            symbol=row.symbol,
            quantity=row.quantity,
            unit_price=row.unit_price,
            currency=row.currency,
            fees=row.fees,
            settlement_amount=row.settlement_amount,
            raw_payload=row.raw_payload,
            raw_doc_uri=row.raw_doc_uri,
            wealth_product_code=row.wealth_product_code,
            review_required=row.review_required,
            review_status=row.review_status,
            dispatch_status=row.dispatch_status,
            dispatch_error=row.dispatch_error,
            created_at=row.created_at,
        )
        for row in rows
    ]


@app.post("/api/v1/wealth-products", response_model=WealthProductRead)
def post_wealth_product(
    payload: WealthProductCreate,
    session: Session = Depends(get_session),
) -> WealthProductRead:
    row = create_wealth_product(session, payload)
    return WealthProductRead.model_validate(row.model_dump())


@app.get("/api/v1/wealth-products", response_model=list[WealthProductRead])
def get_wealth_products(session: Session = Depends(get_session)) -> list[WealthProductRead]:
    return [WealthProductRead.model_validate(row.model_dump()) for row in list_wealth_products(session)]


@app.get("/api/v1/dashboard", response_model=DashboardSnapshot)
def get_dashboard(session: Session = Depends(get_session)) -> DashboardSnapshot:
    return dashboard_snapshot(session)


@app.post("/api/v1/sources/futu-csv/parse", response_model=FutuCsvParseResponse)
async def parse_futu_csv(file: UploadFile = File(...)) -> FutuCsvParseResponse:
    content = await file.read()
    return parse_csv(content)


@app.get("/dashboard", response_class=HTMLResponse, include_in_schema=False)
def dashboard_page(request: Request, session: Session = Depends(get_session)) -> HTMLResponse:
    snapshot = dashboard_snapshot(session)
    context = {"request": request, **dashboard_context(snapshot)}
    return templates.TemplateResponse("dashboard.html", context)


@app.get("/reviews", response_class=HTMLResponse, include_in_schema=False)
def reviews_page(request: Request, session: Session = Depends(get_session)) -> HTMLResponse:
    rows = list_review_queue(session)
    return templates.TemplateResponse(
        "reviews.html",
        {
            "request": request,
            "rows": rows,
        },
    )
