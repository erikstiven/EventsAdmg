import logging
import os
from datetime import datetime
from typing import List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Request
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel
from typing import Literal
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from dependencies.permissions import require_any_permission
from schemas.auth import UserResponse
from services.invitation_groups import InvitationGroupsService
from models.events import Events
from models.invitation_group_statuses import (
    invitation_group_status_label_from_id,
    normalize_invitation_group_status,
)
from sqlalchemy import select

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/invitation-groups", tags=["invitation_groups"])


def get_dynamic_frontend_url(request: Request) -> str:
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")

    referer = request.headers.get("referer")
    if referer:
        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    forwarded_host = request.headers.get("x-forwarded-host")
    host = request.headers.get("host")
    effective_host = forwarded_host or host
    if effective_host:
        return f"{scheme}://{effective_host}"

    return (os.environ.get("FRONTEND_URL") or "http://localhost:3000").rstrip("/")

# Serve uploaded files (dev only)
@router.get("/public/files/{filename}")
async def get_public_file(filename: str):
    file_path = Path("uploads") / "invitation_groups" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(str(file_path))


class InvitationGroupData(BaseModel):
    event_id: int
    titular_name: str
    titular_identification: str
    fingerprint_code: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    group_size: int = 3
    send_email: bool = True
    send_email_cc: bool = False
    intransferible: bool = True
    status: Optional[str] = None
    companions: Optional[list[dict]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class InvitationGroupEditData(BaseModel):
    event_id: Optional[int] = None
    titular_name: Optional[str] = None
    titular_identification: Optional[str] = None
    fingerprint_code: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    group_size: Optional[int] = None
    send_email: Optional[bool] = None
    send_email_cc: Optional[bool] = None
    intransferible: Optional[bool] = None
    companions: Optional[list[dict]] = None


class InvitationGroupResponse(BaseModel):
    id: int
    event_id: int
    event_name: Optional[str] = None
    titular_name: str
    titular_identification: str
    fingerprint_code: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    group_size: int
    send_email: bool
    send_email_cc: bool
    intransferible: bool
    status_id: int
    status: str
    rejection_reason: Optional[str] = None
    token_plain: Optional[str] = None
    link: Optional[str] = None
    companions: Optional[list[dict]] = None
    titular_selfie_url: Optional[str] = None
    titular_doc_url: Optional[str] = None
    titular_approved: Optional[bool] = None
    titular_rejection_reason: Optional[str] = None
    titular_qr_token: Optional[str] = None
    email_sent_at: Optional[datetime] = None
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class InvitationGroupListResponse(BaseModel):
    items: List[InvitationGroupResponse]
    total: int
    skip: int
    limit: int


class PublicInvitationGroupResponse(BaseModel):
    event_id: int
    event_name: str
    titular_name: str
    titular_identification: str
    email: Optional[str] = None
    phone: Optional[str] = None
    fingerprint_code: Optional[str] = None
    titular_selfie_url: Optional[str] = None
    titular_doc_url: Optional[str] = None
    titular_qr_token: Optional[str] = None
    group_size: int
    status_id: int
    status: str
    companions: Optional[list[dict]] = None


class PublicInvitationRegister(BaseModel):
    titular_name: str
    titular_identification: str
    email: Optional[str] = None
    phone: Optional[str] = None
    fingerprint_code: Optional[str] = None
    titular_selfie_url: Optional[str] = None
    titular_doc_url: Optional[str] = None
    companions: Optional[list[dict]] = None
    status: Optional[str] = None


class ApprovalParticipant(BaseModel):
    role: Literal["titular", "acompanante"]
    index: Optional[int] = None
    approved: bool
    rejection_reason: Optional[str] = None


class UpdateParticipant(BaseModel):
    role: Literal["titular", "acompanante"]
    index: Optional[int] = None


class InvitationGroupUpdateRequest(BaseModel):
    reason: Optional[str] = None
    participants: Optional[List[UpdateParticipant]] = None


class InvitationGroupApprovalRequest(BaseModel):
    invitation_id: int
    approved: Optional[bool] = None
    rejection_reason: Optional[str] = None
    participants: Optional[List[ApprovalParticipant]] = None


class InvitationGroupApprovalResponse(BaseModel):
    success: bool
    message: str
    status_id: int
    status: str


class InvitationGroupStatusHistoryResponse(BaseModel):
    id: int
    invitation_group_id: int
    from_status: Optional[str] = None
    to_status: str
    changed_by: str
    reason: Optional[str] = None
    payload: Optional[dict] = None
    changed_at: datetime


class InvitationGroupStatusHistoryListItem(BaseModel):
    id: int
    invitation_group_id: int
    group_label: str
    event_id: int
    event_name: Optional[str] = None
    titular_name: str
    titular_identification: str
    from_status: Optional[str] = None
    to_status: str
    changed_by: str
    reason: Optional[str] = None
    payload: Optional[dict] = None
    changed_at: datetime


class InvitationGroupStatusHistoryListResponse(BaseModel):
    items: List[InvitationGroupStatusHistoryListItem]
    total: int
    skip: int
    limit: int


async def _serialize_invitation_group(item, service: InvitationGroupsService) -> dict:
    companions = await service.get_companions_payload(item.id)
    event_name = f"Evento {item.event_id}"
    try:
        result = await service.db.execute(select(Events).where(Events.id == item.event_id))
        event = result.scalar_one_or_none()
        if event and getattr(event, "name", None):
            event_name = event.name
    except Exception:
        pass
    status_label = invitation_group_status_label_from_id(
        getattr(item, "status_id", None),
        default=normalize_invitation_group_status(getattr(item, "status", None), default="Pendiente completar"),
    )
    return {
        "id": item.id,
        "event_id": item.event_id,
        "event_name": event_name,
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
        "companions": companions or None,
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


@router.post("", response_model=InvitationGroupResponse, status_code=201)
async def create_invitation_group(
    request: Request,
    data: InvitationGroupData,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("invitations.create")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new invitation group"""
    logger.debug(f"Creating invitation group with data: {data}")
    service = InvitationGroupsService(db)
    frontend_base_url = get_dynamic_frontend_url(request)
    try:
        result = await service.create(
            data.model_dump(),
            user_id=str(current_user.id),
            frontend_base_url=frontend_base_url,
        )
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create invitation group")
        return await _serialize_invitation_group(result, service)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating invitation group: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.put("/{invitation_id}", response_model=InvitationGroupResponse)
async def update_invitation_group(
    request: Request,
    invitation_id: int,
    data: InvitationGroupEditData,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("invitations.update")),
    db: AsyncSession = Depends(get_db),
):
    service = InvitationGroupsService(db)
    try:
        result = await service.update_group(
            invitation_id=invitation_id,
            data=data.model_dump(exclude_unset=True),
            user_id=str(current_user.id),
            frontend_base_url=get_dynamic_frontend_url(request),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Invitation group not found")
    return await _serialize_invitation_group(result, service)


@router.get("", response_model=InvitationGroupListResponse)
async def list_invitation_groups(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=2000),
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("invitations.read", "approvals.read")),
    db: AsyncSession = Depends(get_db),
):
    """List invitation groups"""
    service = InvitationGroupsService(db)
    result = await service.get_list(skip=skip, limit=limit)
    items = [await _serialize_invitation_group(item, service) for item in result["items"]]
    return {
        "items": items,
        "total": result["total"],
        "skip": result["skip"],
        "limit": result["limit"],
    }


@router.get("/pending-approvals", response_model=List[InvitationGroupResponse])
async def get_pending_approvals(
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("approvals.read")),
    db: AsyncSession = Depends(get_db),
):
    """List invitation groups pending approval."""
    service = InvitationGroupsService(db)
    result = await service.get_list(skip=0, limit=2000)
    items = result.get("items", [])
    pending = []
    for item in items:
        status_label = invitation_group_status_label_from_id(
            getattr(item, "status_id", None),
            default=normalize_invitation_group_status(getattr(item, "status", None), default="Pendiente completar"),
        )
        status_value = status_label.lower().replace("_", " ").strip()
        # Approver queue should include only actionable states for reviewer decisions.
        if status_value not in {
            "pendiente aprobación",
            "pendiente aprobacion",
            "pendiente de actualización",
            "pendiente de actualizacion",
            "aprobado parcial",
        }:
            continue
        pending.append(await _serialize_invitation_group(item, service))
    return pending


@router.post("/approve", response_model=InvitationGroupApprovalResponse)
async def approve_invitation_group(
    data: InvitationGroupApprovalRequest,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("approvals.decide")),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject invitation group and send QR when approved."""
    service = InvitationGroupsService(db)
    if not data.participants and data.approved is None:
        raise HTTPException(status_code=400, detail="El campo approved es obligatorio.")

    result = await service.approve_group(
        invitation_id=data.invitation_id,
        approved=bool(data.approved) if data.approved is not None else False,
        rejection_reason=data.rejection_reason,
        participants=[p.model_dump() for p in data.participants] if data.participants else None,
        changed_by=str(current_user.id),
    )
    if not result:
        raise HTTPException(status_code=404, detail="Invitation group not found")
    if data.participants:
        msg = "Solicitud procesada."
    else:
        msg = "Invitación aprobada y QR enviado." if data.approved else "Invitación rechazada."
    return InvitationGroupApprovalResponse(
        success=True,
        message=msg,
        status_id=getattr(result, "status_id", 1),
        status=invitation_group_status_label_from_id(
            getattr(result, "status_id", None),
            default=normalize_invitation_group_status(getattr(result, "status", None), default="Pendiente completar"),
        ),
    )


@router.post("/{invitation_id}/request-update", response_model=InvitationGroupResponse)
async def request_update_invitation_group(
    invitation_id: int,
    data: InvitationGroupUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("approvals.decide")),
    db: AsyncSession = Depends(get_db),
):
    """Enable update window for approved/partially approved/pending-approval groups."""
    service = InvitationGroupsService(db)
    try:
        result = await service.request_update(
            invitation_id=invitation_id,
            updated_by=str(current_user.id),
            reason=data.reason,
            participants=[p.model_dump() for p in data.participants] if data.participants else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Invitation group not found")
    return await _serialize_invitation_group(result, service)


@router.get("/{invitation_id}/status-history", response_model=List[InvitationGroupStatusHistoryResponse])
async def get_invitation_group_status_history(
    invitation_id: int,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("invitations.read", "approvals.read", "audit.read")),
    db: AsyncSession = Depends(get_db),
):
    service = InvitationGroupsService(db)
    result = await service.get_status_history(invitation_id)
    items = []
    for row in result:
        payload = None
        if row.payload:
            import json
            try:
                payload = json.loads(row.payload)
            except Exception:
                payload = None
        items.append(
            {
                "id": row.id,
                "invitation_group_id": row.invitation_group_id,
                "from_status": invitation_group_status_label_from_id(
                    row.from_status_id,
                    default=normalize_invitation_group_status(row.from_status, default="Pendiente completar"),
                )
                if (row.from_status_id or row.from_status)
                else None,
                "to_status": invitation_group_status_label_from_id(
                    row.to_status_id,
                    default=normalize_invitation_group_status(row.to_status, default="Pendiente completar"),
                ),
                "changed_by": row.changed_by,
                "reason": row.reason,
                "payload": payload,
                "changed_at": row.changed_at,
            }
        )
    return items


@router.get("/status-history/all", response_model=InvitationGroupStatusHistoryListResponse)
async def get_all_invitation_group_status_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: Optional[str] = Query(None),
    event_id: Optional[int] = Query(None),
    to_status: Optional[str] = Query(None),
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("audit.read", "invitations.read")),
    db: AsyncSession = Depends(get_db),
):
    service = InvitationGroupsService(db)
    result = await service.get_status_history_list(
        skip=skip,
        limit=limit,
        search=search,
        event_id=event_id,
        to_status=to_status,
    )

    items = []
    for history_row, group_row, event_row in result["items"]:
        payload = None
        if history_row.payload:
            import json
            try:
                payload = json.loads(history_row.payload)
            except Exception:
                payload = None

        items.append(
            {
                "id": history_row.id,
                "invitation_group_id": history_row.invitation_group_id,
                "group_label": f"GRP-{history_row.invitation_group_id:04d}",
                "event_id": group_row.event_id,
                "event_name": event_row.name if event_row else None,
                "titular_name": group_row.titular_name,
                "titular_identification": group_row.titular_identification,
                "from_status": invitation_group_status_label_from_id(
                    history_row.from_status_id,
                    default=normalize_invitation_group_status(
                        history_row.from_status,
                        default="Pendiente completar",
                    ),
                )
                if (history_row.from_status_id or history_row.from_status)
                else None,
                "to_status": invitation_group_status_label_from_id(
                    history_row.to_status_id,
                    default=normalize_invitation_group_status(
                        history_row.to_status,
                        default="Pendiente completar",
                    ),
                ),
                "changed_by": history_row.changed_by,
                "reason": history_row.reason,
                "payload": payload,
                "changed_at": history_row.changed_at,
            }
        )

    return {
        "items": items,
        "total": result["total"],
        "skip": result["skip"],
        "limit": result["limit"],
    }


@router.get("/public/{token}", response_model=PublicInvitationGroupResponse)
async def get_public_invitation_group(token: str, db: AsyncSession = Depends(get_db)):
    service = InvitationGroupsService(db)
    obj = await service.get_by_token(token)
    if not obj:
        raise HTTPException(status_code=404, detail="Token inválido o expirado")

    event_name = f"Evento {obj.event_id}"
    try:
        result = await db.execute(select(Events).where(Events.id == obj.event_id))
        event = result.scalar_one_or_none()
        if event and event.name:
            event_name = event.name
    except Exception:
        pass

    companions = await service.get_companions_payload(obj.id)

    return {
        "event_id": obj.event_id,
        "event_name": event_name,
        "titular_name": obj.titular_name,
        "titular_identification": obj.titular_identification,
        "email": obj.email,
        "phone": obj.phone,
        "fingerprint_code": obj.fingerprint_code,
        "titular_selfie_url": obj.titular_selfie_url,
        "titular_doc_url": obj.titular_doc_url,
        "group_size": obj.group_size,
        "status_id": obj.status_id,
        "status": invitation_group_status_label_from_id(
            getattr(obj, "status_id", None),
            default=normalize_invitation_group_status(getattr(obj, "status", None), default="Pendiente completar"),
        ),
        "companions": companions or None,
    }


@router.post("/public/{token}/register", response_model=PublicInvitationGroupResponse)
async def register_public_invitation_group(
    token: str,
    data: PublicInvitationRegister,
    db: AsyncSession = Depends(get_db),
):
    service = InvitationGroupsService(db)
    try:
        obj = await service.register_by_token(token, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not obj:
        raise HTTPException(status_code=404, detail="Token inválido o expirado")

    event_name = f"Evento {obj.event_id}"
    try:
        result = await db.execute(select(Events).where(Events.id == obj.event_id))
        event = result.scalar_one_or_none()
        if event and event.name:
            event_name = event.name
    except Exception:
        pass

    companions = await service.get_companions_payload(obj.id)

    return {
        "event_id": obj.event_id,
        "event_name": event_name,
        "titular_name": obj.titular_name,
        "titular_identification": obj.titular_identification,
        "email": obj.email,
        "phone": obj.phone,
        "fingerprint_code": obj.fingerprint_code,
        "titular_selfie_url": obj.titular_selfie_url,
        "titular_doc_url": obj.titular_doc_url,
        "group_size": obj.group_size,
        "status_id": obj.status_id,
        "status": invitation_group_status_label_from_id(
            getattr(obj, "status_id", None),
            default=normalize_invitation_group_status(getattr(obj, "status", None), default="Pendiente completar"),
        ),
        "companions": companions or None,
    }


@router.post("/public/{token}/upload", response_model=PublicInvitationGroupResponse)
async def upload_public_media(
    token: str,
    role: str = Form(...),
    kind: str = Form(...),
    companion_index: Optional[int] = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    service = InvitationGroupsService(db)
    file_bytes = await file.read()
    try:
        obj = await service.upload_media_by_token(
            token_plain=token,
            role=role,
            kind=kind,
            file_bytes=file_bytes,
            original_name=file.filename or "upload.jpg",
            companion_index=companion_index,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not obj:
        raise HTTPException(status_code=404, detail="Token inválido o expirado")

    event_name = f"Evento {obj.event_id}"
    try:
        result = await db.execute(select(Events).where(Events.id == obj.event_id))
        event = result.scalar_one_or_none()
        if event and event.name:
            event_name = event.name
    except Exception:
        pass

    companions = await service.get_companions_payload(obj.id)

    return {
        "event_id": obj.event_id,
        "event_name": event_name,
        "titular_name": obj.titular_name,
        "titular_identification": obj.titular_identification,
        "email": obj.email,
        "phone": obj.phone,
        "fingerprint_code": obj.fingerprint_code,
        "titular_selfie_url": obj.titular_selfie_url,
        "titular_doc_url": obj.titular_doc_url,
        "group_size": obj.group_size,
        "status_id": obj.status_id,
        "status": invitation_group_status_label_from_id(
            getattr(obj, "status_id", None),
            default=normalize_invitation_group_status(getattr(obj, "status", None), default="Pendiente completar"),
        ),
        "companions": companions or None,
    }


@router.post("/{invitation_id}/resend", response_model=InvitationGroupResponse)
async def resend_invitation_email(
    invitation_id: int,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("invitations.resend", "invitations.update")),
    db: AsyncSession = Depends(get_db),
):
    """Resend invitation email."""
    service = InvitationGroupsService(db)
    result = await service.resend_email(invitation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Invitation group not found")
    return await _serialize_invitation_group(result, service)
