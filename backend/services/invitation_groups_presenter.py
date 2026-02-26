from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.events import Events
from models.invitation_group_statuses import (
    invitation_group_status_label_from_id,
    normalize_invitation_group_status,
)
from services.invitation_groups import InvitationGroupsService


async def resolve_event_name(db: AsyncSession, event_id: int) -> str:
    event_name = f"Evento {event_id}"
    try:
        result = await db.execute(select(Events).where(Events.id == event_id))
        event = result.scalar_one_or_none()
        if event and getattr(event, "name", None):
            event_name = event.name
    except Exception:
        pass
    return event_name


def resolve_status_label(item: Any) -> str:
    return invitation_group_status_label_from_id(
        getattr(item, "status_id", None),
        default=normalize_invitation_group_status(getattr(item, "status", None), default="Pendiente completar"),
    )


async def serialize_invitation_group(
    item: Any,
    service: InvitationGroupsService,
    *,
    event_name: Optional[str] = None,
    companions: Optional[list[dict]] = None,
) -> Dict[str, Any]:
    resolved_companions = companions if companions is not None else await service.get_companions_payload(item.id)
    resolved_event_name = event_name or await resolve_event_name(service.db, item.event_id)
    status_label = resolve_status_label(item)
    return {
        "id": item.id,
        "event_id": item.event_id,
        "event_name": resolved_event_name,
        "titular_name": item.titular_name,
        "titular_identification": item.titular_identification,
        "fingerprint_code": item.fingerprint_code,
        "email": item.email,
        "phone": item.phone,
        "group_size": item.group_size,
        "send_email": item.send_email,
        "send_email_cc": item.send_email_cc,
        "intransferible": item.intransferible,
        "status_id": item.status_id,
        "status": status_label,
        "rejection_reason": getattr(item, "rejection_reason", None),
        "token_plain": item.token_plain,
        "link": item.link,
        "companions": resolved_companions or None,
        "titular_selfie_url": item.titular_selfie_url,
        "titular_doc_url": item.titular_doc_url,
        "titular_approved": getattr(item, "titular_approved", None),
        "titular_rejection_reason": getattr(item, "titular_rejection_reason", None),
        "titular_qr_token": getattr(item, "titular_qr_token", None),
        "email_sent_at": item.email_sent_at,
        "created_by": item.created_by,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


async def serialize_public_invitation_group(item: Any, service: InvitationGroupsService) -> Dict[str, Any]:
    companions = await service.get_companions_payload(item.id)
    event_name = await resolve_event_name(service.db, item.event_id)
    return {
        "event_id": item.event_id,
        "event_name": event_name,
        "titular_name": item.titular_name,
        "titular_identification": item.titular_identification,
        "email": item.email,
        "phone": item.phone,
        "fingerprint_code": item.fingerprint_code,
        "titular_selfie_url": item.titular_selfie_url,
        "titular_doc_url": item.titular_doc_url,
        "group_size": item.group_size,
        "status_id": item.status_id,
        "status": resolve_status_label(item),
        "companions": companions or None,
    }
