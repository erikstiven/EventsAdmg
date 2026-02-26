from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.invitation_group_people import Invitation_group_people
from models.invitation_groups import Invitation_groups
from services.attendees import AttendeesService
from services.checkins import CheckinsService
from services.events import EventsService
from services.invitations import InvitationsService


class CheckinFlowService:
    """Encapsulates QR validation and QR check-in flow."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.invitations_service = InvitationsService(db)
        self.attendees_service = AttendeesService(db)
        self.events_service = EventsService(db)
        self.checkins_service = CheckinsService(db)

    @staticmethod
    def normalize_token(raw_token: str) -> str:
        token = raw_token.strip()
        if "/" in token:
            token = token.rstrip("/").split("/")[-1]
        return token

    async def validate_qr(self, raw_token: str) -> Dict[str, Any]:
        token = self.normalize_token(raw_token)

        invitation = await self.invitations_service.get_by_field("token_plain", token)
        if invitation:
            if invitation.status != "APROBADO":
                return {"valid": False, "message": f"Invitación no aprobada. Estado actual: {invitation.status}"}
            if invitation.status == "USADO" or invitation.used_at:
                return {"valid": False, "message": "Esta invitación ya fue utilizada"}

            attendee = await self.attendees_service.get_by_id(invitation.attendee_id)
            event = await self.events_service.get_by_id(invitation.event_id)
            return {
                "valid": True,
                "message": "Token válido. Proceda con validación biométrica.",
                "invitation_id": invitation.id,
                "attendee_id": attendee.id if attendee else None,
                "attendee_name": attendee.full_name if attendee else None,
                "attendee_photo_url": attendee.face_photo_url if attendee else None,
                "event_name": event.name if event else None,
                "fingerprint_code": attendee.fingerprint_code if attendee else None,
                "id_document_url": attendee.id_document_url if attendee else None,
            }

        grp_result = await self.db.execute(select(Invitation_groups).where(Invitation_groups.titular_qr_token == token))
        group = grp_result.scalar_one_or_none()
        role = None
        person = None

        if group:
            role = "titular"
        else:
            comp_result = await self.db.execute(
                select(Invitation_group_people).where(Invitation_group_people.qr_token == token)
            )
            comp_row = comp_result.scalar_one_or_none()
            if comp_row:
                group_result = await self.db.execute(
                    select(Invitation_groups).where(Invitation_groups.id == comp_row.invitation_group_id)
                )
                group = group_result.scalar_one_or_none()
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
            return {"valid": False, "message": "Token inválido o no encontrado"}

        if role == "titular":
            if not group.titular_approved:
                return {"valid": False, "message": "Titular no aprobado. Estado actual: Pendiente aprobación"}
            person_name = group.titular_name
            fingerprint_code = group.fingerprint_code
            selfie_url = group.titular_selfie_url
            doc_url = group.titular_doc_url
        else:
            if not person:
                return {"valid": False, "message": "Invitado no encontrado"}
            if not person.get("approved"):
                return {"valid": False, "message": "Invitado no aprobado. Estado actual: Pendiente aprobación"}
            person_name = person.get("name")
            fingerprint_code = person.get("codigo")
            selfie_url = person.get("selfie_url")
            doc_url = person.get("doc_url")

        event = await self.events_service.get_by_id(group.event_id)
        return {
            "valid": True,
            "message": "Token válido. Proceda con validación biométrica.",
            "invitation_id": group.id,
            "attendee_id": None,
            "attendee_name": person_name,
            "attendee_photo_url": selfie_url,
            "event_name": event.name if event else None,
            "fingerprint_code": fingerprint_code,
            "id_document_url": doc_url,
        }

    async def qr_checkin(
        self,
        *,
        request: Request,
        raw_token: str,
        gate: str,
        current_user_id: str,
    ) -> Dict[str, Any]:
        token = self.normalize_token(raw_token)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        invitation = await self.invitations_service.get_by_field("token_plain", token)
        if invitation:
            if invitation.status != "APROBADO":
                return {"success": False, "message": f"Invitación no aprobada. Estado actual: {invitation.status}"}
            if invitation.status == "USADO" or invitation.used_at:
                return {"success": False, "message": "Esta invitación ya fue utilizada"}

            attendee = await self.attendees_service.get_by_id(invitation.attendee_id)
            event = await self.events_service.get_by_id(invitation.event_id)
            checkin_data = {
                "invitation_id": invitation.id,
                "event_id": invitation.event_id,
                "attendee_id": invitation.attendee_id,
                "participant_role": "attendee",
                "staff_user_id": current_user_id,
                "gate": gate,
                "biometric_validated": False,
                "validation_method": "QR",
                "validation_notes": f"QR token used: {token}",
                "qr_token_used": token,
                "checked_in_at": now_str,
                "created_at": now_str,
            }
            checkin = await self.checkins_service.create(checkin_data, invitation.user_id)
            await self.invitations_service.mark_used(
                invitation.id,
                changed_by=str(current_user_id),
                user_id=invitation.user_id,
                reason="qr_checkin",
                endpoint=str(request.url.path),
                request_id=request.headers.get("x-request-id"),
            )
            return {
                "success": True,
                "message": "✅ Acceso permitido. QR registrado y marcado como usado.",
                "checkin_id": checkin.id,
                "attendee_name": attendee.full_name if attendee else None,
                "event_name": event.name if event else None,
            }

        grp_result = await self.db.execute(select(Invitation_groups).where(Invitation_groups.titular_qr_token == token))
        group = grp_result.scalar_one_or_none()
        if group:
            if not group.titular_approved:
                return {"success": False, "message": "Titular no aprobado. Acceso denegado."}
            event = await self.events_service.get_by_id(group.event_id)
            checkin_data = {
                "invitation_id": group.id,
                "event_id": group.event_id,
                "participant_role": "titular",
                "staff_user_id": current_user_id,
                "gate": gate,
                "biometric_validated": False,
                "validation_method": "QR_GROUP",
                "validation_notes": f"QR group titular used: {token}",
                "qr_token_used": token,
                "checked_in_at": now_str,
                "created_at": now_str,
            }
            checkin = await self.checkins_service.create(checkin_data, group.created_by)
            group.titular_qr_token = None
            group.updated_at = datetime.now()
            await self.db.commit()
            return {
                "success": True,
                "message": "✅ Acceso permitido. QR de titular consumido.",
                "checkin_id": checkin.id,
                "attendee_name": group.titular_name,
                "event_name": event.name if event else None,
            }

        comp_result = await self.db.execute(
            select(Invitation_group_people).where(Invitation_group_people.qr_token == token)
        )
        companion = comp_result.scalar_one_or_none()
        if companion:
            if not companion.approved:
                return {"success": False, "message": "Invitado no aprobado. Acceso denegado."}
            group_result = await self.db.execute(
                select(Invitation_groups).where(Invitation_groups.id == companion.invitation_group_id)
            )
            group = group_result.scalar_one_or_none()
            if not group:
                return {"success": False, "message": "Grupo no encontrado para este QR."}
            event = await self.events_service.get_by_id(group.event_id)
            checkin_data = {
                "invitation_id": group.id,
                "event_id": group.event_id,
                "invitation_group_person_id": companion.id,
                "participant_role": "acompanante",
                "staff_user_id": current_user_id,
                "gate": gate,
                "biometric_validated": False,
                "validation_method": "QR_GROUP",
                "validation_notes": f"QR group companion[{companion.person_index}] used: {token}",
                "qr_token_used": token,
                "checked_in_at": now_str,
                "created_at": now_str,
            }
            checkin = await self.checkins_service.create(checkin_data, group.created_by)
            companion.qr_token = None
            companion.updated_at = datetime.now()
            await self.db.commit()
            return {
                "success": True,
                "message": "✅ Acceso permitido. QR de acompañante consumido.",
                "checkin_id": checkin.id,
                "attendee_name": companion.name,
                "event_name": event.name if event else None,
            }

        return {"success": False, "message": "Token inválido o no encontrado."}
