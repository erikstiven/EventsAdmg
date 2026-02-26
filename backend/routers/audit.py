from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.permissions import require_any_permission
from schemas.auth import UserResponse

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


class AuditEventItem(BaseModel):
    event_uid: str
    event_time: datetime
    category: str
    event_type: str
    outcome: Optional[str] = None
    severity: str
    event_id: Optional[int] = None
    event_name: Optional[str] = None
    invitation_id: Optional[int] = None
    invitation_group_id: Optional[int] = None
    attendee_id: Optional[int] = None
    attendee_name: Optional[str] = None
    actor_user_id: Optional[str] = None
    entity_type: str
    entity_id: Optional[str] = None
    source_table: str
    source_pk: int
    summary: Optional[str] = None
    metadata: Optional[dict] = None


class AuditEventsResponse(BaseModel):
    items: list[AuditEventItem]
    total: int
    skip: int
    limit: int


class AuditKpisResponse(BaseModel):
    total_events: int
    checkins: int
    biometric_attempts: int
    biometric_matches: int
    biometric_no_match: int
    manual_overrides: int
    access_denied: int
    config_changes: int
    biometric_match_rate: float


def _parse_metadata(raw: Optional[str]) -> Optional[dict]:
    if not raw:
        return None
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {"value": value}
    except Exception:
        return {"raw": raw}


def _build_filters_sql(
    *,
    search: Optional[str],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    event_id: Optional[int],
    category: Optional[str],
    event_type: Optional[str],
    outcome: Optional[str],
    severity: Optional[str],
    actor_user_id: Optional[str],
) -> tuple[str, dict]:
    where = ["1=1"]
    params: dict = {}

    if search and search.strip():
        params["search"] = f"%{search.strip()}%"
        where.append(
            "("
            "event_uid LIKE :search OR event_type LIKE :search OR category LIKE :search OR "
            "coalesce(event_name, '') LIKE :search OR coalesce(attendee_name, '') LIKE :search OR "
            "coalesce(actor_user_id, '') LIKE :search OR coalesce(entity_id, '') LIKE :search OR "
            "coalesce(summary, '') LIKE :search"
            ")"
        )
    if date_from:
        params["date_from"] = date_from
        where.append("event_time >= :date_from")
    if date_to:
        params["date_to"] = date_to
        where.append("event_time <= :date_to")
    if event_id is not None:
        params["event_id"] = event_id
        where.append("event_id = :event_id")
    if category:
        params["category"] = category
        where.append("category = :category")
    if event_type:
        params["event_type"] = event_type
        where.append("event_type = :event_type")
    if outcome:
        params["outcome"] = outcome
        where.append("outcome = :outcome")
    if severity:
        params["severity"] = severity
        where.append("severity = :severity")
    if actor_user_id:
        params["actor_user_id"] = actor_user_id
        where.append("actor_user_id = :actor_user_id")

    return " AND ".join(where), params


@router.get("/events", response_model=AuditEventsResponse)
async def list_audit_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    search: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    event_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    outcome: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    actor_user_id: Optional[str] = Query(None),
    _perm: UserResponse = Depends(require_any_permission("audit.read")),
    db: AsyncSession = Depends(get_db),
):
    where_sql, params = _build_filters_sql(
        search=search,
        date_from=date_from,
        date_to=date_to,
        event_id=event_id,
        category=category,
        event_type=event_type,
        outcome=outcome,
        severity=severity,
        actor_user_id=actor_user_id,
    )
    params["skip"] = skip
    params["limit"] = limit

    data_sql = text(
        f"""
        SELECT
          event_uid, event_time, category, event_type, outcome, severity,
          event_id, event_name, invitation_id, invitation_group_id, attendee_id, attendee_name,
          actor_user_id, entity_type, entity_id, source_table, source_pk, summary, metadata_json
        FROM vw_audit_events
        WHERE {where_sql}
        ORDER BY event_time DESC, source_pk DESC
        LIMIT :limit OFFSET :skip
        """
    )
    count_sql = text(f"SELECT COUNT(1) AS total FROM vw_audit_events WHERE {where_sql}")

    rows = (await db.execute(data_sql, params)).mappings().all()
    total = int((await db.execute(count_sql, params)).scalar() or 0)

    items: list[AuditEventItem] = []
    for row in rows:
        items.append(
            AuditEventItem(
                event_uid=str(row["event_uid"]),
                event_time=row["event_time"],
                category=str(row["category"]),
                event_type=str(row["event_type"]),
                outcome=row["outcome"],
                severity=str(row["severity"]),
                event_id=row["event_id"],
                event_name=row["event_name"],
                invitation_id=row["invitation_id"],
                invitation_group_id=row["invitation_group_id"],
                attendee_id=row["attendee_id"],
                attendee_name=row["attendee_name"],
                actor_user_id=row["actor_user_id"],
                entity_type=str(row["entity_type"]),
                entity_id=row["entity_id"],
                source_table=str(row["source_table"]),
                source_pk=int(row["source_pk"]),
                summary=row["summary"],
                metadata=_parse_metadata(row["metadata_json"]),
            )
        )

    return AuditEventsResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/kpis", response_model=AuditKpisResponse)
async def get_audit_kpis(
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    event_id: Optional[int] = Query(None),
    _perm: UserResponse = Depends(require_any_permission("audit.read")),
    db: AsyncSession = Depends(get_db),
):
    where_sql, params = _build_filters_sql(
        search=None,
        date_from=date_from,
        date_to=date_to,
        event_id=event_id,
        category=None,
        event_type=None,
        outcome=None,
        severity=None,
        actor_user_id=None,
    )
    sql = text(
        f"""
        SELECT
          COUNT(1) AS total_events,
          SUM(CASE WHEN category = 'checkin' THEN 1 ELSE 0 END) AS checkins,
          SUM(CASE WHEN category = 'biometric' THEN 1 ELSE 0 END) AS biometric_attempts,
          SUM(CASE WHEN category = 'biometric' AND outcome = 'MATCH' THEN 1 ELSE 0 END) AS biometric_matches,
          SUM(CASE WHEN category = 'biometric' AND outcome IN ('NO_MATCH', 'NO_EMBEDDING') THEN 1 ELSE 0 END) AS biometric_no_match,
          SUM(CASE WHEN category = 'checkin' AND event_type = 'CHECKIN_MANUAL_OVERRIDE' THEN 1 ELSE 0 END) AS manual_overrides,
          SUM(CASE WHEN category = 'security' AND event_type = 'ACCESS_DENIED' THEN 1 ELSE 0 END) AS access_denied,
          SUM(CASE WHEN category = 'security' AND event_type IN ('SETTING_UPDATED', 'SETTING_ADDED', 'SETTING_DELETED') THEN 1 ELSE 0 END) AS config_changes
        FROM vw_audit_events
        WHERE {where_sql}
        """
    )
    row = (await db.execute(sql, params)).mappings().first() or {}

    attempts = int(row.get("biometric_attempts") or 0)
    matches = int(row.get("biometric_matches") or 0)
    rate = round((matches / attempts) * 100, 2) if attempts else 0.0

    return AuditKpisResponse(
        total_events=int(row.get("total_events") or 0),
        checkins=int(row.get("checkins") or 0),
        biometric_attempts=attempts,
        biometric_matches=matches,
        biometric_no_match=int(row.get("biometric_no_match") or 0),
        manual_overrides=int(row.get("manual_overrides") or 0),
        access_denied=int(row.get("access_denied") or 0),
        config_changes=int(row.get("config_changes") or 0),
        biometric_match_rate=rate,
    )


@router.get("/timeline/{entity_type}/{entity_id}", response_model=list[AuditEventItem])
async def get_audit_timeline(
    entity_type: str,
    entity_id: str,
    limit: int = Query(100, ge=1, le=500),
    _perm: UserResponse = Depends(require_any_permission("audit.read")),
    db: AsyncSession = Depends(get_db),
):
    sql = text(
        """
        SELECT
          event_uid, event_time, category, event_type, outcome, severity,
          event_id, event_name, invitation_id, invitation_group_id, attendee_id, attendee_name,
          actor_user_id, entity_type, entity_id, source_table, source_pk, summary, metadata_json
        FROM vw_audit_events
        WHERE entity_type = :entity_type AND entity_id = :entity_id
        ORDER BY event_time DESC, source_pk DESC
        LIMIT :limit
        """
    )
    rows = (await db.execute(sql, {"entity_type": entity_type, "entity_id": entity_id, "limit": limit})).mappings().all()
    return [
        AuditEventItem(
            event_uid=str(row["event_uid"]),
            event_time=row["event_time"],
            category=str(row["category"]),
            event_type=str(row["event_type"]),
            outcome=row["outcome"],
            severity=str(row["severity"]),
            event_id=row["event_id"],
            event_name=row["event_name"],
            invitation_id=row["invitation_id"],
            invitation_group_id=row["invitation_group_id"],
            attendee_id=row["attendee_id"],
            attendee_name=row["attendee_name"],
            actor_user_id=row["actor_user_id"],
            entity_type=str(row["entity_type"]),
            entity_id=row["entity_id"],
            source_table=str(row["source_table"]),
            source_pk=int(row["source_pk"]),
            summary=row["summary"],
            metadata=_parse_metadata(row["metadata_json"]),
        )
        for row in rows
    ]
