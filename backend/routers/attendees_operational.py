from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from dependencies.permissions import require_any_permission
from models.attendees import Attendees
from models.biometric_embeddings import Biometric_embeddings
from models.checkins import Checkins
from models.events import Events
from models.invitations import Invitations
from schemas.auth import UserResponse

router = APIRouter(prefix="/api/attendees", tags=["attendees-operational"])


class AttendeeOperationalView(BaseModel):
    invitation_id: int
    attendee_id: int
    full_name: str
    identification: str
    event_id: int
    event_name: str
    invitation_status: str
    biometric_status: str
    checkin_status: str
    created_at: datetime


class AttendeesOperationalMetrics(BaseModel):
    total: int
    pendientes: int
    aprobados: int
    ingresados: int
    rechazados: int


class AttendeesOperationalResponse(BaseModel):
    items: List[AttendeeOperationalView]
    page: int
    pageSize: int
    total: int
    metrics: AttendeesOperationalMetrics


@router.get("/operational", response_model=AttendeesOperationalResponse)
async def attendees_operational(
    eventId: Optional[int] = Query(None),
    status: Optional[str] = Query(None, description="pending|approved|rejected"),
    biometric: Optional[str] = Query(None, description="ok|missing"),
    checkin: Optional[str] = Query(None, description="checked_in|not_checked"),
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=200),
    dateFrom: Optional[datetime] = Query(None),
    dateTo: Optional[datetime] = Query(None),
    _user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("attendees.read", "invitations.read", "approvals.read")),
    db: AsyncSession = Depends(get_db),
):
    latest_invitation_sub = (
        select(
            Invitations.id.label("invitation_id"),
            Invitations.attendee_id.label("attendee_id"),
            Invitations.event_id.label("event_id"),
            Invitations.status.label("status"),
            Invitations.created_at.label("created_at"),
            func.row_number()
            .over(
                partition_by=(Invitations.attendee_id, Invitations.event_id),
                order_by=(
                    func.coalesce(Invitations.updated_at, Invitations.created_at).desc(),
                    Invitations.id.desc(),
                ),
            )
            .label("rn"),
        )
        .subquery()
    )

    status_expr = case(
        (func.upper(latest_invitation_sub.c.status) == "RECHAZADO", "rejected"),
        (func.upper(latest_invitation_sub.c.status) == "REVOCADO", "rejected"),
        (func.upper(latest_invitation_sub.c.status).in_(["APROBADO", "USADO"]), "approved"),
        else_="pending",
    ).label("invitation_status")

    biometric_expr = case(
        (
            exists(
                select(1).where(
                    and_(
                        Biometric_embeddings.person_id == Attendees.id,
                        Biometric_embeddings.is_active.is_(True),
                    )
                )
            ),
            "ok",
        ),
        else_="missing",
    ).label("biometric_status")

    checkin_expr = case(
        (
            exists(
                select(1).where(
                    and_(
                        Checkins.attendee_id == Attendees.id,
                        Checkins.event_id == latest_invitation_sub.c.event_id,
                    )
                )
            ),
            "checked_in",
        ),
        else_="not_checked",
    ).label("checkin_status")

    base = (
        select(
            latest_invitation_sub.c.invitation_id.label("invitation_id"),
            Attendees.id.label("attendee_id"),
            Attendees.full_name,
            Attendees.identification,
            latest_invitation_sub.c.event_id.label("event_id"),
            Events.name.label("event_name"),
            status_expr,
            biometric_expr,
            checkin_expr,
            latest_invitation_sub.c.created_at.label("created_at"),
        )
        .select_from(latest_invitation_sub)
        .join(Attendees, Attendees.id == latest_invitation_sub.c.attendee_id)
        .join(Events, Events.id == latest_invitation_sub.c.event_id)
        .where(latest_invitation_sub.c.rn == 1)
    )

    if eventId:
        base = base.where(latest_invitation_sub.c.event_id == eventId)

    if status in {"pending", "approved", "rejected"}:
        base = base.where(status_expr == status)

    if biometric in {"ok", "missing"}:
        base = base.where(biometric_expr == biometric)

    if checkin in {"checked_in", "not_checked"}:
        base = base.where(checkin_expr == checkin)

    if q:
        term = f"%{q.lower().strip()}%"
        base = base.where(
            or_(
                func.lower(Attendees.full_name).like(term),
                func.lower(Attendees.identification).like(term),
            )
        )

    if dateFrom:
        base = base.where(latest_invitation_sub.c.created_at >= dateFrom)
    if dateTo:
        base = base.where(latest_invitation_sub.c.created_at <= dateTo)

    base_sub = base.subquery()

    metrics_query = select(
        func.count().label("total"),
        func.coalesce(func.sum(case((base_sub.c.invitation_status == "pending", 1), else_=0)), 0).label(
            "pendientes"
        ),
        func.coalesce(func.sum(case((base_sub.c.invitation_status == "approved", 1), else_=0)), 0).label(
            "aprobados"
        ),
        func.coalesce(func.sum(case((base_sub.c.invitation_status == "rejected", 1), else_=0)), 0).label(
            "rechazados"
        ),
        func.coalesce(func.sum(case((base_sub.c.checkin_status == "checked_in", 1), else_=0)), 0).label(
            "ingresados"
        ),
    )

    metrics_row = (await db.execute(metrics_query)).mappings().first() or {}

    total = int(metrics_row.get("total") or 0)

    page_offset = (page - 1) * pageSize
    data_query = base.order_by(latest_invitation_sub.c.created_at.desc()).offset(page_offset).limit(pageSize)
    rows = (await db.execute(data_query)).mappings().all()

    items = [
        AttendeeOperationalView(
            invitation_id=row["invitation_id"],
            attendee_id=row["attendee_id"],
            full_name=row["full_name"],
            identification=row["identification"],
            event_id=row["event_id"],
            event_name=row["event_name"],
            invitation_status=row["invitation_status"],
            biometric_status=row["biometric_status"],
            checkin_status=row["checkin_status"],
            created_at=row["created_at"],
        )
        for row in rows
    ]

    metrics = AttendeesOperationalMetrics(
        total=total,
        pendientes=int(metrics_row.get("pendientes") or 0),
        aprobados=int(metrics_row.get("aprobados") or 0),
        ingresados=int(metrics_row.get("ingresados") or 0),
        rechazados=int(metrics_row.get("rechazados") or 0),
    )

    return AttendeesOperationalResponse(
        items=items,
        page=page,
        pageSize=pageSize,
        total=total,
        metrics=metrics,
    )
