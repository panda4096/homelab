from __future__ import annotations

import csv
import io

from app.normalizers.futu_csv import normalize_row
from app.schemas import FutuCsvParseResponse, ParsedFutuRow


def parse_csv(content: bytes) -> FutuCsvParseResponse:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    parsed: list[ParsedFutuRow] = []
    for row in reader:
        activity, anomalies = normalize_row(row)
        parsed.append(ParsedFutuRow(activity=activity, anomalies=anomalies))
    return FutuCsvParseResponse(parsed=parsed)
