# @req FR-06 — smoke test: app บูตได้ + endpoint พื้นฐานตอบ
"""เทสต์ว่า app บูตได้ + endpoint พื้นฐานตอบ (กันของพังเงียบตอนเพิ่ม router)"""


def test_root_reports_service(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["service"] == "G-Music"


def test_projects_starts_empty(client):
    r = client.get("/projects")
    assert r.status_code == 200
    assert r.json() == {"projects": []}


def test_save_then_load_project(client):
    saved = client.post("/projects", json={"name": "t1", "data": {"schemaVersion": 3}})
    assert saved.status_code == 200
    pid = saved.json()["id"]

    loaded = client.get(f"/projects/{pid}")
    assert loaded.status_code == 200
    assert loaded.json()["data"] == {"schemaVersion": 3}


def test_data_dir_is_isolated(client, data_dir):
    client.post("/projects", json={"name": "t", "data": {}})
    assert list((data_dir / "projects").glob("*.json"))
