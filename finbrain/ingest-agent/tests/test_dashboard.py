def test_dashboard_has_fixed_sections(client):
    response = client.get("/api/v1/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {
        "currencies",
        "categories",
        "maturity_calendar",
        "recent_imports",
        "alerts",
    }
