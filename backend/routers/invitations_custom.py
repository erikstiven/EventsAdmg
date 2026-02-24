"""Custom invitation management endpoints"""
import logging
import secrets
import hashlib
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List

from core.database import get_db
from models.security_audit_logs import Security_audit_logs
from dependencies.auth import get_current_user
from dependencies.permissions import require_any_permission
from schemas.auth import UserResponse
from services.invitations import InvitationsService
from services.attendees import AttendeesService
from services.events import EventsService
from services.storage import StorageService
from services.facial_biometrics import FacialBiometricsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/invitations", tags=["invitations"])

_ACTIVATION_ATTEMPTS: dict[str, deque[float]] = defaultdict(deque)
_ACTIVATION_BLOCK_UNTIL: dict[str, float] = {}
_ACTIVATION_WINDOW_SECONDS = 300
_ACTIVATION_MAX_ATTEMPTS = 6
_ACTIVATION_BLOCK_SECONDS = 900


def _activation_key(ip_address: str, email_or_phone: str) -> str:
    normalized = (email_or_phone or "").strip().lower()
    return f"{ip_address}|{normalized}"


def _is_activation_blocked(key: str) -> bool:
    blocked_until = _ACTIVATION_BLOCK_UNTIL.get(key, 0.0)
    return blocked_until > time.time()


def _register_activation_failure(key: str) -> None:
    now = time.time()
    q = _ACTIVATION_ATTEMPTS[key]
    q.append(now)
    while q and (now - q[0] > _ACTIVATION_WINDOW_SECONDS):
        q.popleft()
    if len(q) >= _ACTIVATION_MAX_ATTEMPTS:
        _ACTIVATION_BLOCK_UNTIL[key] = now + _ACTIVATION_BLOCK_SECONDS


def _clear_activation_failures(key: str) -> None:
    _ACTIVATION_ATTEMPTS.pop(key, None)
    _ACTIVATION_BLOCK_UNTIL.pop(key, None)


class GenerateInvitationRequest(BaseModel):
    event_id: int
    attendee_id: int
    biometric_photo: Optional[str] = None  # Base64 encoded photo


class GenerateInvitationResponse(BaseModel):
    invitation_id: int
    token_plain: str
    qr_data: str
    status: str
    activation_code: str
    biometric_registered: bool


class ActivateInvitationRequest(BaseModel):
    email_or_phone: str
    activation_code: str


class ActivateInvitationResponse(BaseModel):
    success: bool
    message: str
    invitation_id: Optional[int] = None
    status: Optional[str] = None


class ApprovalRequest(BaseModel):
    invitation_id: int
    approved: bool
    rejection_reason: Optional[str] = None


class ApprovalResponse(BaseModel):
    success: bool
    message: str
    new_status: str


class InvitationDetailResponse(BaseModel):
    id: int
    event_id: int
    event_name: str
    attendee_id: int
    attendee_name: str
    attendee_email: str
    attendee_phone: Optional[str]
    status: str
    created_at: str
    token_plain: str
    activation_code: Optional[str] = None
    biometric_photo: Optional[str] = None


class InvitationStatusHistoryResponse(BaseModel):
    id: int
    invitation_id: int
    from_status: Optional[str] = None
    to_status: str
    changed_by: str
    changed_at: datetime
    reason: Optional[str] = None
    endpoint: Optional[str] = None
    request_id: Optional[str] = None


@router.post("/generate", response_model=GenerateInvitationResponse)
async def generate_invitation(
    request: Request,
    data: GenerateInvitationRequest,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("invitations.create")),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new invitation with QR token and optional biometric photo (ADMIN only)"""
    try:
        # Verify event exists
        events_service = EventsService(db)
        event = await events_service.get_by_id(data.event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Verify attendee exists
        attendees_service = AttendeesService(db)
        attendee = await attendees_service.get_by_id(data.attendee_id)
        if not attendee:
            raise HTTPException(status_code=404, detail="Attendee not found")
        
        # Generate unique token
        token_plain = f"INV-{datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(8).upper()}"
        token_hash = hashlib.sha256(token_plain.encode()).hexdigest()
        
        # Generate activation code
        activation_code = str(secrets.randbelow(1000000)).zfill(6)
        
        # If a biometric photo is provided as base64, save it to local storage
        biometric_photo_url = None
        if data.biometric_photo:
            try:
                storage_service = StorageService()
                biometric_photo_url = await storage_service.save_base64_image(
                    data.biometric_photo, 
                    bucket_name="biometric",
                    filename_prefix=f"inv_{attendee.id}"
                )
                logger.info(f"Biometric photo saved to local storage: {biometric_photo_url}")
            except Exception as e:
                logger.warning(f"Failed to save biometric photo to storage: {e}. Storing as base64 in DB instead.")
                biometric_photo_url = data.biometric_photo

        # Create invitation
        invitations_service = InvitationsService(db)
        invitation_data = {
            "user_id": attendee.user_id,
            "event_id": data.event_id,
            "attendee_id": data.attendee_id,
            "token": token_hash,
            "token_plain": token_plain,
            "status": "GENERADO",
            "activation_code": activation_code,
            "biometric_photo": biometric_photo_url,  # Store URL or base64 fallback
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        
        invitation = await invitations_service.create(
            invitation_data,
            attendee.user_id,
            changed_by=str(current_user.id),
            reason="generated",
            endpoint=str(request.url.path),
            request_id=request.headers.get("x-request-id") or str(uuid.uuid4()),
        )

        # Shadow mode: register attendee embedding if a biometric image was provided.
        if biometric_photo_url:
            try:
                biometric_service = FacialBiometricsService(db)
                await biometric_service.register_embedding_for_person(
                    person_id=attendee.id,
                    image_input=biometric_photo_url,
                    actor_user_id=str(current_user.id),
                    source="invitations.generate.biometric_photo",
                )
            except Exception as exc:
                logger.warning("Could not register embedding on invitation generation: %s", exc)

        biometric_registered = bool(biometric_photo_url)
        logger.info(f"✅ Generated invitation ID={invitation.id}, code={activation_code}, status={invitation.status}, biometric={biometric_registered}")
        
        return GenerateInvitationResponse(
            invitation_id=invitation.id,
            token_plain=token_plain,
            qr_data=token_plain,
            status=invitation.status,
            activation_code=activation_code,
            biometric_registered=biometric_registered
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating invitation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/activate", response_model=ActivateInvitationResponse)
async def activate_invitation(
    request: Request,
    data: ActivateInvitationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Activate an invitation by attendee (public endpoint)"""
    try:
        email_or_phone = data.email_or_phone.strip()
        activation_code = data.activation_code.strip()
        ip_address = request.client.host if request.client else "unknown"
        activation_attempt_key = _activation_key(ip_address, email_or_phone)
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())

        if _is_activation_blocked(activation_attempt_key):
            raise HTTPException(
                status_code=429,
                detail="Demasiados intentos fallidos. Intente nuevamente en unos minutos.",
            )
        
        logger.info(f"🔍 Intentando activación - Email/Teléfono: '{email_or_phone}', Código: '{activation_code}'")
        
        from sqlalchemy import func, or_
        from models.attendees import Attendees
        from models.invitations import Invitations
        
        # Búsqueda insensible a mayúsculas para el asistente
        attendee_query = select(Attendees).where(
            or_(
                func.lower(Attendees.email) == email_or_phone.lower(),
                Attendees.phone == email_or_phone
            )
        )
        result = await db.execute(attendee_query)
        attendee = result.scalar_one_or_none()
        
        if not attendee:
            logger.warning(f"❌ Asistente no encontrado: '{email_or_phone}'")
            _register_activation_failure(activation_attempt_key)
            db.add(
                Security_audit_logs(
                    actor_user_id="anonymous",
                    event_type="INVITATION_ACTIVATION_FAILED",
                    target_type="INVITATION_ACTIVATION",
                    target_id=email_or_phone,
                    endpoint=str(request.url.path),
                    method=request.method,
                    details_json='{"reason":"attendee_not_found"}',
                    ip_address=ip_address,
                    user_agent=request.headers.get("user-agent"),
                )
            )
            await db.commit()
            raise HTTPException(status_code=404, detail="No se encontró un asistente registrado con ese correo o teléfono.")
        
        logger.info(f"✅ Asistente encontrado: ID={attendee.id}, Nombre={attendee.full_name}, Email DB={attendee.email}")
        
        # Buscar invitación para este asistente que esté en estado GENERADO
        invitations_service = InvitationsService(db)
        inv_query = select(Invitations).where(
            Invitations.attendee_id == attendee.id,
            Invitations.activation_code == activation_code
        )
        inv_result = await db.execute(inv_query)
        matching_invitation = inv_result.scalar_one_or_none()
        
        if not matching_invitation:
            logger.warning(f"❌ No se encontró invitación válida para el código '{activation_code}'")
            _register_activation_failure(activation_attempt_key)
            db.add(
                Security_audit_logs(
                    actor_user_id=str(attendee.user_id) if attendee else "anonymous",
                    event_type="INVITATION_ACTIVATION_FAILED",
                    target_type="INVITATION_ACTIVATION",
                    target_id=str(attendee.id) if attendee else email_or_phone,
                    endpoint=str(request.url.path),
                    method=request.method,
                    details_json='{"reason":"invalid_activation_code"}',
                    ip_address=ip_address,
                    user_agent=request.headers.get("user-agent"),
                )
            )
            await db.commit()
            # Log de invitaciones disponibles para depuración
            all_inv_result = await db.execute(select(Invitations).where(Invitations.attendee_id == attendee.id))
            all_invs = all_inv_result.scalars().all()
            logger.info(f"📋 El asistente tiene {len(all_invs)} invitaciones en total:")
            for inv in all_invs:
                logger.info(f"  - ID: {inv.id}, Estado: {inv.status}, Código en DB: '{inv.activation_code}'")
            
            raise HTTPException(
                status_code=400, 
                detail="Código de activación inválido o la invitación ya fue activada/usada."
            )

        if matching_invitation.status != "GENERADO":
            logger.warning(f"❌ La invitación {matching_invitation.id} ya tiene estado {matching_invitation.status}")
            _register_activation_failure(activation_attempt_key)
            db.add(
                Security_audit_logs(
                    actor_user_id=str(attendee.user_id),
                    event_type="INVITATION_ACTIVATION_FAILED",
                    target_type="INVITATION",
                    target_id=str(matching_invitation.id),
                    endpoint=str(request.url.path),
                    method=request.method,
                    details_json=f'{{"reason":"invalid_current_status","status":"{matching_invitation.status}"}}',
                    ip_address=ip_address,
                    user_agent=request.headers.get("user-agent"),
                )
            )
            await db.commit()
            raise HTTPException(
                status_code=400, 
                detail=f"Esta invitación ya ha sido procesada (Estado: {matching_invitation.status})."
            )
        
        updated = await invitations_service.activate_invitation(
            matching_invitation.id,
            changed_by=str(attendee.user_id),
            reason="activation_code_validated",
            endpoint=str(request.url.path),
            request_id=request_id,
        )
        
        if not updated:
            raise HTTPException(status_code=500, detail="Error crítico al actualizar la invitación.")

        _clear_activation_failures(activation_attempt_key)
        db.add(
            Security_audit_logs(
                actor_user_id=str(attendee.user_id),
                event_type="INVITATION_ACTIVATED",
                target_type="INVITATION",
                target_id=str(updated.id),
                endpoint=str(request.url.path),
                method=request.method,
                details_json='{"result":"success"}',
                ip_address=ip_address,
                user_agent=request.headers.get("user-agent"),
            )
        )
        await db.commit()

        logger.info(f"✅ Activación exitosa! ID={updated.id}, Nuevo estado={updated.status}")
        
        return ActivateInvitationResponse(
            success=True,
            message="¡Invitación activada con éxito! Ahora está pendiente de aprobación por el administrador.",
            invitation_id=updated.id,
            status=updated.status
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error en activación: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending-approvals", response_model=List[InvitationDetailResponse])
async def get_pending_approvals(
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("approvals.read")),
    db: AsyncSession = Depends(get_db),
):
    """Get all invitations pending approval (APROBADOR only)"""
    try:
        invitations_service = InvitationsService(db)
        attendees_service = AttendeesService(db)
        events_service = EventsService(db)
        
        # Get all pending invitations
        result = await invitations_service.get_list(
            query_dict={"status": "PENDIENTE_APROBACION"},
            limit=100
        )
        
        invitations_detail = []
        for inv in result["items"]:
            attendee = await attendees_service.get_by_id(inv.attendee_id)
            event = await events_service.get_by_id(inv.event_id)
            
            invitations_detail.append(InvitationDetailResponse(
                id=inv.id,
                event_id=inv.event_id,
                event_name=event.name if event else "Unknown",
                attendee_id=inv.attendee_id,
                attendee_name=attendee.full_name if attendee else "Unknown",
                attendee_email=attendee.email if attendee else "",
                attendee_phone=attendee.phone if attendee else None,
                status=inv.status,
                created_at=inv.created_at.strftime("%Y-%m-%d %H:%M:%S") if hasattr(inv.created_at, 'strftime') else str(inv.created_at),
                token_plain=inv.token_plain,
                activation_code=inv.activation_code,
                biometric_photo=inv.biometric_photo
            ))
        
        return invitations_detail
    except Exception as e:
        logger.error(f"Error getting pending approvals: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/approve", response_model=ApprovalResponse)
async def approve_or_reject_invitation(
    request: Request,
    data: ApprovalRequest,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("approvals.decide")),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject an invitation (APROBADOR only)"""
    try:
        invitations_service = InvitationsService(db)
        
        # Get invitation
        invitation = await invitations_service.get_by_id(data.invitation_id)
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        updated = await invitations_service.decide_approval(
            data.invitation_id,
            approved=data.approved,
            changed_by=str(current_user.id),
            rejection_reason=data.rejection_reason,
            endpoint=str(request.url.path),
            request_id=request.headers.get("x-request-id") or str(uuid.uuid4()),
        )
        
        return ApprovalResponse(
            success=True,
            message=f"Invitation {'approved' if data.approved else 'rejected'} successfully",
            new_status=updated.status
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving/rejecting invitation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/my-invitations", response_model=List[InvitationDetailResponse])
async def get_my_invitations(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's invitations (ASISTENTE)"""
    try:
        invitations_service = InvitationsService(db)
        attendees_service = AttendeesService(db)
        events_service = EventsService(db)
        
        # Get user's invitations
        result = await invitations_service.get_list(user_id=current_user.id, limit=100)
        
        invitations_detail = []
        for inv in result["items"]:
            attendee = await attendees_service.get_by_id(inv.attendee_id)
            event = await events_service.get_by_id(inv.event_id)
            
            invitations_detail.append(InvitationDetailResponse(
                id=inv.id,
                event_id=inv.event_id,
                event_name=event.name if event else "Unknown",
                attendee_id=inv.attendee_id,
                attendee_name=attendee.full_name if attendee else "Unknown",
                attendee_email=attendee.email if attendee else "",
                attendee_phone=attendee.phone if attendee else None,
                status=inv.status,
                created_at=inv.created_at.strftime("%Y-%m-%d %H:%M:%S") if hasattr(inv.created_at, 'strftime') else str(inv.created_at),
                token_plain=inv.token_plain,
                activation_code=inv.activation_code if inv.status == "GENERADO" else None,
                biometric_photo=inv.biometric_photo
            ))
        
        return invitations_detail
    except Exception as e:
        logger.error(f"Error getting my invitations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{invitation_id}/status-history", response_model=List[InvitationStatusHistoryResponse])
async def get_invitation_status_history(
    invitation_id: int,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("invitations.read", "audit.read")),
    db: AsyncSession = Depends(get_db),
):
    invitations_service = InvitationsService(db)
    invitation = await invitations_service.get_by_id(invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.user_id != current_user.id and not bool(getattr(current_user, "is_superuser", False)):
        role = str(getattr(current_user, "role", "")).upper()
        if role != "ADMIN":
            raise HTTPException(status_code=403, detail="Not enough permissions to view this history")

    rows = await invitations_service.get_status_history(invitation_id)
    return [
        InvitationStatusHistoryResponse(
            id=row.id,
            invitation_id=row.invitation_id,
            from_status=row.from_status,
            to_status=row.to_status,
            changed_by=row.changed_by,
            changed_at=row.changed_at,
            reason=row.reason,
            endpoint=row.endpoint,
            request_id=row.request_id,
        )
        for row in rows
    ]
