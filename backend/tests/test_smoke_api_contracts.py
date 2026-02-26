from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

from main import app


client = TestClient(app)


def test_health_endpoint_is_available() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "healthy"


def test_database_health_endpoint_is_available() -> None:
    response = client.get("/database/health")
    assert response.status_code == 200
    body = response.json()
    assert body.get("service") == "database"
    assert body.get("status") in {"healthy", "unhealthy"}


def test_protected_invitation_groups_endpoint_exists() -> None:
    response = client.get("/api/v1/invitation-groups")
    assert response.status_code in {401, 403}


def test_protected_attendees_lookup_endpoint_exists() -> None:
    response = client.get("/api/v1/entities/attendees/lookup", params={"cedula": "1234567890"})
    assert response.status_code in {401, 403}


def test_protected_checkin_validate_qr_endpoint_exists() -> None:
    response = client.post("/api/v1/checkin/validate-qr", json={"token": "dummy-token"})
    assert response.status_code in {401, 403}


def test_protected_invitation_approvals_endpoint_exists() -> None:
    response = client.get("/api/v1/invitations/pending-approvals")
    assert response.status_code in {401, 403}
