from pathlib import Path


def test_futu_csv_parse_endpoint(client):
    sample = Path("app/fixtures/sample_futu_activity.csv")
    with sample.open("rb") as handle:
        response = client.post(
            "/api/v1/sources/futu-csv/parse",
            files={"file": ("sample.csv", handle, "text/csv")},
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body["parsed"]) == 1
    assert body["parsed"][0]["activity"]["source"] == "futu_csv"
    assert body["parsed"][0]["anomalies"] == []
