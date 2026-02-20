"""Custom check-in and biometric validation endpoints"""
import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from pydantic import BaseModel
from typing import Optional, List

from core.database import get_db
from dependencies.auth import get_current_user
from dependencies.permissions import require_any_permission
from schemas.auth import UserResponse
from services.invitations import InvitationsService
from services.attendees import AttendeesService
from services.events import EventsService
from services.checkins import CheckinsService
from services.biometric_validations import Biometric_validationsService
from services.facial_biometrics import FacialBiometricsService
from services.storage import StorageService
from models.invitation_groups import Invitation_groups
from models.invitation_group_people import Invitation_group_people
from models.checkins import Checkins
from models.attendees import Attendees
from models.events import Events

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/checkin", tags=["checkin"])


class ValidateQRRequest(BaseModel):
    token: str
    gate: Optional[str] = "Main Gate"


class ValidateQRResponse(BaseModel):
    valid: bool
    message: str
    invitation_id: Optional[int] = None
    attendee_id: Optional[int] = None
    attendee_name: Optional[str] = None
    attendee_photo_url: Optional[str] = None
    event_name: Optional[str] = None
    fingerprint_code: Optional[str] = None
    id_document_url: Optional[str] = None


class BiometricValidationRequest(BaseModel):
    invitation_id: int
    captured_photo_base64: str
    gate: Optional[str] = "Main Gate"


class BiometricValidationResponse(BaseModel):
    success: bool
    validation_result: str
    match_score: Optional[float] = None
    message: str
    checkin_id: Optional[int] = None
    require_manual: bool = False


class ManualValidationRequest(BaseModel):
    invitation_id: int
    fingerprint_code: str
    gate: Optional[str] = "Main Gate"
    notes: Optional[str] = None


class ManualValidationResponse(BaseModel):
    success: bool
    message: str
    checkin_id: Optional[int] = None


class QRCheckInRequest(BaseModel):
    token: str
    gate: Optional[str] = "Main Gate"


class QRCheckInResponse(BaseModel):
    success: bool
    message: str
    checkin_id: Optional[int] = None
    attendee_name: Optional[str] = None
    event_name: Optional[str] = None


class RecentCheckInItem(BaseModel):
    id: int
    checked_in_at: datetime
    attendee_name: str
    attendee_identification: Optional[str] = None
    event_id: int
    event_name: Optional[str] = None
    participant_role: Optional[str] = None
    validation_method: Optional[str] = None
    gate: Optional[str] = None


class RecentCheckInListResponse(BaseModel):
    items: List[RecentCheckInItem]
    total: int
    skip: int
    limit: int


@router.post("/validate-qr", response_model=ValidateQRResponse)
async def validate_qr_code(
    data: ValidateQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("checkin.scan")),
    db: AsyncSession = Depends(get_db),
):
    """Validate QR code token (STAFF only)"""
    try:
        invitations_service = InvitationsService(db)
        attendees_service = AttendeesService(db)
        events_service = EventsService(db)

        token = data.token.strip()
        if "/" in token:
            token = token.rstrip("/").split("/")[-1]
        
        # Find invitation by token_plain
        invitation = await invitations_service.get_by_field("token_plain", token)
        
        if invitation:
            # Validate status
            if invitation.status != "APROBADO":
                return ValidateQRResponse(
                    valid=False,
                    message=f"Invitación no aprobada. Estado actual: {invitation.status}"
                )

            # Check if already used
            if invitation.status == "USADO" or invitation.used_at:
                return ValidateQRResponse(
                    valid=False,
                    message="Esta invitación ya fue utilizada"
                )

            # Get attendee and event details
            attendee = await attendees_service.get_by_id(invitation.attendee_id)
            event = await events_service.get_by_id(invitation.event_id)

            return ValidateQRResponse(
                valid=True,
                message="Token válido. Proceda con validación biométrica.",
                invitation_id=invitation.id,
                attendee_id=attendee.id if attendee else None,
                attendee_name=attendee.full_name if attendee else None,
                attendee_photo_url=attendee.face_photo_url if attendee else None,
                event_name=event.name if event else None,
                fingerprint_code=attendee.fingerprint_code if attendee else None,
                id_document_url=attendee.id_document_url if attendee else None
            )

        # Try invitation groups QR tokens (titular or companion)
        result = await db.execute(
            select(Invitation_groups).where(
                (Invitation_groups.titular_qr_token == token)
            )
        )
        group = result.scalar_one_or_none()
        role = None
        person = None
        if group:
            role = "titular"
        else:
            comp_result = await db.execute(
                select(Invitation_group_people).where(Invitation_group_people.qr_token == token)
            )
            comp_row = comp_result.scalar_one_or_none()
            if comp_row:
                grp_result = await db.execute(
                    select(Invitation_groups).where(Invitation_groups.id == comp_row.invitation_group_id)
                )
                group = grp_result.scalar_one_or_none()
                if group:
                    role = "acompanante"
                    person = {
                        "name": comp_row.name,
                        "codigo": comp_row.codigo,
                        "selfie_url": comp_row.selfie_url,
                        "doc_url": comp_row.doc_url,
                        "approved": comp_row.approved,
                    }

        if not group:
            return ValidateQRResponse(
                valid=False,
                message="Token inválido o no encontrado"
            )

        # Approval check
        if role == "titular":
            if not group.titular_approved:
                return ValidateQRResponse(
                    valid=False,
                    message="Titular no aprobado. Estado actual: Pendiente aprobación"
                )
            person_name = group.titular_name
            fingerprint_code = group.fingerprint_code
            selfie_url = group.titular_selfie_url
            doc_url = group.titular_doc_url
        else:
            if not person:
                return ValidateQRResponse(
                    valid=False,
                    message="Invitado no encontrado"
                )
            if not person.get("approved"):
                return ValidateQRResponse(
                    valid=False,
                    message="Invitado no aprobado. Estado actual: Pendiente aprobación"
                )
            person_name = person.get("name")
            fingerprint_code = person.get("codigo")
            selfie_url = person.get("selfie_url")
            doc_url = person.get("doc_url")

        event = await events_service.get_by_id(group.event_id)

        return ValidateQRResponse(
            valid=True,
            message="Token válido. Proceda con validación biométrica.",
            invitation_id=group.id,
            attendee_id=None,
            attendee_name=person_name,
            attendee_photo_url=selfie_url,
            event_name=event.name if event else None,
            fingerprint_code=fingerprint_code,
            id_document_url=doc_url,
        )
    except Exception as e:
        logger.error(f"Error validating QR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/qr-checkin", response_model=QRCheckInResponse)
async def qr_checkin(
    data: QRCheckInRequest,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("checkin.scan")),
    db: AsyncSession = Depends(get_db),
):
    """QR-only check-in: validates and consumes QR token to prevent reuse."""
    try:
        invitations_service = InvitationsService(db)
        events_service = EventsService(db)
        checkins_service = CheckinsService(db)

        token = data.token.strip()
        if "/" in token:
            token = token.rstrip("/").split("/")[-1]

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # 1) Classic invitation token
        invitation = await invitations_service.get_by_field("token_plain", token)
        if invitation:
            if invitation.status != "APROBADO":
                return QRCheckInResponse(
                    success=False,
                    message=f"Invitación no aprobada. Estado actual: {invitation.status}",
                )
            if invitation.status == "USADO" or invitation.used_at:
                return QRCheckInResponse(
                    success=False,
                    message="Esta invitación ya fue utilizada",
                )

            attendee = await AttendeesService(db).get_by_id(invitation.attendee_id)
            event = await events_service.get_by_id(invitation.event_id)

            checkin_data = {
                "invitation_id": invitation.id,
                "event_id": invitation.event_id,
                "attendee_id": invitation.attendee_id,
                "participant_role": "attendee",
                "staff_user_id": current_user.id,
                "gate": data.gate,
                "biometric_validated": False,
                "validation_method": "QR",
                "validation_notes": f"QR token used: {token}",
                "qr_token_used": token,
                "checked_in_at": now_str,
                "created_at": now_str,
            }
            checkin = await checkins_service.create(checkin_data, invitation.user_id)

            await invitations_service.update(
                invitation.id,
                {
                    "status": "USADO",
                    "used_at": now_str,
                    "updated_at": now_str,
                },
                invitation.user_id,
            )
            return QRCheckInResponse(
                success=True,
                message="✅ Acceso permitido. QR registrado y marcado como usado.",
                checkin_id=checkin.id,
                attendee_name=attendee.full_name if attendee else None,
                event_name=event.name if event else None,
            )

        # 2) Group titular token
        grp_result = await db.execute(
            select(Invitation_groups).where(Invitation_groups.titular_qr_token == token)
        )
        group = grp_result.scalar_one_or_none()
        if group:
            if not group.titular_approved:
                return QRCheckInResponse(
                    success=False,
                    message="Titular no aprobado. Acceso denegado.",
                )

            event = await events_service.get_by_id(group.event_id)
            checkin_data = {
                "invitation_id": group.id,
                "event_id": group.event_id,
                "participant_role": "titular",
                "staff_user_id": current_user.id,
                "gate": data.gate,
                "biometric_validated": False,
                "validation_method": "QR_GROUP",
                "validation_notes": f"QR group titular used: {token}",
                "qr_token_used": token,
                "checked_in_at": now_str,
                "created_at": now_str,
            }
            checkin = await checkins_service.create(checkin_data, group.created_by)

            group.titular_qr_token = None
            group.updated_at = datetime.now()
            await db.commit()

            return QRCheckInResponse(
                success=True,
                message="✅ Acceso permitido. QR de titular consumido.",
                checkin_id=checkin.id,
                attendee_name=group.titular_name,
                event_name=event.name if event else None,
            )

        # 3) Group companion token
        comp_result = await db.execute(
            select(Invitation_group_people).where(Invitation_group_people.qr_token == token)
        )
        companion = comp_result.scalar_one_or_none()
        if companion:
            if not companion.approved:
                return QRCheckInResponse(
                    success=False,
                    message="Invitado no aprobado. Acceso denegado.",
                )

            group_result = await db.execute(
                select(Invitation_groups).where(Invitation_groups.id == companion.invitation_group_id)
            )
            group = group_result.scalar_one_or_none()
            if not group:
                return QRCheckInResponse(success=False, message="Grupo no encontrado para este QR.")

            event = await events_service.get_by_id(group.event_id)
            checkin_data = {
                "invitation_id": group.id,
                "event_id": group.event_id,
                "invitation_group_person_id": companion.id,
                "participant_role": "acompanante",
                "staff_user_id": current_user.id,
                "gate": data.gate,
                "biometric_validated": False,
                "validation_method": "QR_GROUP",
                "validation_notes": f"QR group companion[{companion.person_index}] used: {token}",
                "qr_token_used": token,
                "checked_in_at": now_str,
                "created_at": now_str,
            }
            checkin = await checkins_service.create(checkin_data, group.created_by)

            companion.qr_token = None
            companion.updated_at = datetime.now()
            await db.commit()

            return QRCheckInResponse(
                success=True,
                message="✅ Acceso permitido. QR de acompañante consumido.",
                checkin_id=checkin.id,
                attendee_name=companion.name,
                event_name=event.name if event else None,
            )

        return QRCheckInResponse(
            success=False,
            message="Token inválido o no encontrado.",
        )
    except Exception as e:
        logger.error(f"Error in QR check-in: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recent", response_model=RecentCheckInListResponse)
async def recent_checkins(
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=200),
    search: Optional[str] = Query(None),
    event_id: Optional[int] = Query(None),
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("checkin.scan")),
    db: AsyncSession = Depends(get_db),
):
    """Recent successful check-ins for operational visibility."""
    conditions = []
    if search and search.strip():
        like = f"%{search.strip()}%"
        conditions.append(
            or_(
                Attendees.full_name.ilike(like),
                Attendees.identification.ilike(like),
                Invitation_group_people.name.ilike(like),
                Invitation_group_people.cedula.ilike(like),
                Invitation_groups.titular_name.ilike(like),
                Invitation_groups.titular_identification.ilike(like),
                Events.name.ilike(like),
                Checkins.validation_method.ilike(like),
            )
        )
    if event_id is not None:
        conditions.append(Checkins.event_id == event_id)

    data_query = (
        select(
            Checkins,
            Attendees.full_name.label("attendee_name"),
            Attendees.identification.label("attendee_identification"),
            Invitation_group_people.name.label("companion_name"),
            Invitation_group_people.cedula.label("companion_cedula"),
            Invitation_groups.titular_name.label("titular_name"),
            Invitation_groups.titular_identification.label("titular_identification"),
            Events.name.label("event_name"),
        )
        .select_from(Checkins)
        .outerjoin(Attendees, Attendees.id == Checkins.attendee_id)
        .outerjoin(Invitation_group_people, Invitation_group_people.id == Checkins.invitation_group_person_id)
        .outerjoin(Invitation_groups, Invitation_groups.id == Checkins.invitation_id)
        .outerjoin(Events, Events.id == Checkins.event_id)
    )
    if conditions:
        for condition in conditions:
            data_query = data_query.where(condition)
    data_query = (
        data_query
        .order_by(Checkins.checked_in_at.desc(), Checkins.id.desc())
        .offset(skip)
        .limit(limit)
    )

    count_query = (
        select(func.count(Checkins.id))
        .select_from(Checkins)
        .outerjoin(Attendees, Attendees.id == Checkins.attendee_id)
        .outerjoin(Invitation_group_people, Invitation_group_people.id == Checkins.invitation_group_person_id)
        .outerjoin(Invitation_groups, Invitation_groups.id == Checkins.invitation_id)
        .outerjoin(Events, Events.id == Checkins.event_id)
    )
    if conditions:
        for condition in conditions:
            count_query = count_query.where(condition)

    rows = (await db.execute(data_query)).all()
    total = int((await db.execute(count_query)).scalar() or 0)

    items: List[RecentCheckInItem] = []
    for row in rows:
        checkin = row[0]
        role = (checkin.participant_role or "").lower()
        if role == "titular":
            attendee_name = row.titular_name or "Titular"
            attendee_identification = row.titular_identification
        elif role == "acompanante":
            attendee_name = row.companion_name or "Acompañante"
            attendee_identification = row.companion_cedula
        else:
            attendee_name = row.attendee_name or "Invitado"
            attendee_identification = row.attendee_identification

        items.append(
            RecentCheckInItem(
                id=checkin.id,
                checked_in_at=checkin.checked_in_at,
                attendee_name=attendee_name,
                attendee_identification=attendee_identification,
                event_id=checkin.event_id,
                event_name=row.event_name,
                participant_role=checkin.participant_role,
                validation_method=checkin.validation_method,
                gate=checkin.gate,
            )
        )

    return RecentCheckInListResponse(items=items, total=total, skip=skip, limit=limit)


@router.post("/validate-biometric", response_model=BiometricValidationResponse)
async def biometric_validation(
    data: BiometricValidationRequest,
    request: Request,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("checkin.biometric")),
    db: AsyncSession = Depends(get_db),
):
    """Perform biometric facial validation in shadow mode (STAFF only)."""
    try:
        invitations_service = InvitationsService(db)
        attendees_service = AttendeesService(db)
        checkins_service = CheckinsService(db)
        biometric_validation_service = Biometric_validationsService(db)
        facial_service = FacialBiometricsService(db)
        
        # Get invitation
        invitation = await invitations_service.get_by_id(data.invitation_id)
        if not invitation or invitation.status != "APROBADO":
            raise HTTPException(status_code=400, detail="Invalid invitation")
        
        # Get attendee
        attendee = await attendees_service.get_by_id(invitation.attendee_id)
        if not attendee:
            raise HTTPException(status_code=404, detail="Attendee not found")
            
        # Prioritize the biometric photo from the invitation, if not available use the one from the attendee profile
        reference_photo_url = invitation.biometric_photo or attendee.face_photo_url
        if not reference_photo_url:
            raise HTTPException(status_code=400, detail="Reference biometric photo not found for this attendee")
        
        # Save the captured validation photo to local storage
        captured_photo_url = None
        if data.captured_photo_base64:
            try:
                storage_service = StorageService()
                captured_photo_url = await storage_service.save_base64_image(
                    data.captured_photo_base64,
                    bucket_name="validations",
                    filename_prefix=f"val_{invitation.id}"
                )
                logger.info(f"Captured validation photo saved: {captured_photo_url}")
            except Exception as e:
                logger.warning(f"Failed to save captured photo to storage: {e}")
                captured_photo_url = "data:image/jpeg;base64," + data.captured_photo_base64[:50] + "..."

        device_info = json.dumps(
            {
                "gate": data.gate,
                "user_agent": request.headers.get("user-agent"),
                "ip": request.client.host if request.client else None,
            },
            ensure_ascii=False,
        )

        compare_result = await facial_service.compare_1to1_shadow(
            person_id=attendee.id,
            captured_image_input=data.captured_photo_base64 or captured_photo_url or "",
            device_info=device_info,
            actor_user_id=str(current_user.id),
            request=request,
        )
        validation_result = compare_result["result"]
        match_score = compare_result.get("score")
        enforcement_enabled = bool(compare_result.get("enforcement"))
        threshold = float(compare_result.get("threshold") or facial_service.match_threshold)

        # Create biometric validation record
        biometric_data = {
            "captured_photo_url": captured_photo_url,
            "reference_photo_url": reference_photo_url,
            "match_score": match_score,
            "validation_result": validation_result,
            "ai_response": json.dumps(
                {
                    "mode": "enforcement" if enforcement_enabled else "shadow",
                    "result": validation_result,
                    "score": match_score,
                    "threshold": threshold,
                    "model_version": facial_service.model_version,
                },
                ensure_ascii=False,
            ),
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

        await biometric_validation_service.create(biometric_data, invitation.user_id)

        allow_access = True
        if enforcement_enabled:
            allow_access = validation_result == "MATCH"

        if allow_access:
            # Create check-in record
            checkin_data = {
                "invitation_id": invitation.id,
                "event_id": invitation.event_id,
                "attendee_id": invitation.attendee_id,
                "participant_role": "attendee",
                "staff_user_id": current_user.id,
                "gate": data.gate,
                "biometric_validated": validation_result == "MATCH",
                "validation_method": "FACIAL" if enforcement_enabled else "FACIAL_SHADOW",
                "validation_notes": (
                    f"Facial result={validation_result}, score={match_score}, threshold={threshold}, "
                    f"mode={'enforcement' if enforcement_enabled else 'shadow'}"
                ),
                "checked_in_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
            
            checkin = await checkins_service.create(checkin_data, invitation.user_id)
            
            # Update invitation status to USADO
            await invitations_service.update(
                invitation.id,
                {
                    "status": "USADO",
                    "used_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                },
                invitation.user_id
            )
            
            return BiometricValidationResponse(
                success=True,
                validation_result=validation_result,
                match_score=match_score,
                message=(
                    "✅ Validación biométrica registrada en modo sombra. Acceso permitido."
                    if not enforcement_enabled
                    else "✅ Validación biométrica exitosa. Acceso permitido."
                ),
                checkin_id=checkin.id,
                require_manual=False
            )

        return BiometricValidationResponse(
            success=False,
            validation_result=validation_result,
            match_score=match_score,
            message="❌ Validación biométrica fallida por umbral. Se requiere verificación manual.",
            require_manual=True
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in biometric validation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/manual-validate", response_model=ManualValidationResponse)
async def manual_validation(
    data: ManualValidationRequest,
    current_user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("checkin.manual_approve")),
    db: AsyncSession = Depends(get_db),
):
    """Manual validation with fingerprint code and ID document (STAFF only)"""
    try:
        invitations_service = InvitationsService(db)
        attendees_service = AttendeesService(db)
        checkins_service = CheckinsService(db)
        
        # Get invitation
        invitation = await invitations_service.get_by_id(data.invitation_id)
        if not invitation or invitation.status != "APROBADO":
            raise HTTPException(status_code=400, detail="Invalid invitation")
        
        # Get attendee
        attendee = await attendees_service.get_by_id(invitation.attendee_id)
        if not attendee:
            raise HTTPException(status_code=400, detail="Attendee not found")
        
        # Validate fingerprint code
        if attendee.fingerprint_code != data.fingerprint_code:
            return ManualValidationResponse(
                success=False,
                message="❌ Código de huella dactilar incorrecto"
            )
        
        # Create check-in record
        checkin_data = {
            "user_id": invitation.user_id,
            "invitation_id": invitation.id,
            "event_id": invitation.event_id,
            "attendee_id": invitation.attendee_id,
            "participant_role": "attendee",
            "staff_user_id": current_user.id,
            "gate": data.gate,
            "biometric_validated": False,
            "validation_method": "FINGERPRINT",
            "validation_notes": f"Manual validation: {data.notes or 'Biometric failed, fingerprint verified'}",
            "checked_in_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        
        checkin = await checkins_service.create(checkin_data, invitation.user_id)
        
        # Update invitation status to USADO
        await invitations_service.update(
            invitation.id,
            {
                "status": "USADO",
                "used_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            },
            invitation.user_id
        )
        
        return ManualValidationResponse(
            success=True,
            message="✅ Validación manual exitosa. Acceso permitido.",
            checkin_id=checkin.id
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in manual validation: {e}")
        raise HTTPException(status_code=500, detail=str(e))
