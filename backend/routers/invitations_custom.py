"""Custom invitation management endpoints"""
import logging
import secrets
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.invitations import InvitationsService
from services.attendees import AttendeesService
from services.events import EventsService
from services.storage import StorageService
from services.facial_biometrics import FacialBiometricsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/invitations", tags=["invitations"])


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


@router.post("/generate", response_model=GenerateInvitationResponse)
async def generate_invitation(
    data: GenerateInvitationRequest,
    current_user: UserResponse = Depends(get_current_user),
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
        
        invitation = await invitations_service.create(invitation_data, attendee.user_id)

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
    data: ActivateInvitationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Activate an invitation by attendee (public endpoint)"""
    try:
        email_or_phone = data.email_or_phone.strip()
        activation_code = data.activation_code.strip()
        
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
            raise HTTPException(
                status_code=400, 
                detail=f"Esta invitación ya ha sido procesada (Estado: {matching_invitation.status})."
            )
        
        # Actualizar estado a PENDIENTE_APROBACION
        # Usamos el servicio pero sin pasar user_id para evitar el check de propiedad, 
        # ya que la validación se hizo via activation_code
        updated = await invitations_service.update(
            matching_invitation.id,
            {
                "status": "PENDIENTE_APROBACION",
                "updated_at": datetime.now(timezone.utc),
            }
        )
        
        if not updated:
            raise HTTPException(status_code=500, detail="Error crítico al actualizar la invitación.")

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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error activating invitation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending-approvals", response_model=List[InvitationDetailResponse])
async def get_pending_approvals(
    current_user: UserResponse = Depends(get_current_user),
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
    data: ApprovalRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject an invitation (APROBADOR only)"""
    try:
        invitations_service = InvitationsService(db)
        
        # Get invitation
        invitation = await invitations_service.get_by_id(data.invitation_id)
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        if invitation.status != "PENDIENTE_APROBACION":
            raise HTTPException(status_code=400, detail="Invitation is not pending approval")
        
        # Update status
        new_status = "APROBADO" if data.approved else "RECHAZADO"
        update_data = {
            "status": new_status,
            "approved_by": current_user.id,
            "approved_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        
        if not data.approved and data.rejection_reason:
            update_data["rejection_reason"] = data.rejection_reason
        
        updated = await invitations_service.update(data.invitation_id, update_data, invitation.user_id)
        
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
