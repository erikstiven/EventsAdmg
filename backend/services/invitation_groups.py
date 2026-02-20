import hashlib
import base64
import hashlib
import json
import logging
import os
import secrets
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, Optional

import qrcode
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from models.events import Events
from models.invitation_group_people import Invitation_group_people
from models.invitation_group_status_history import Invitation_group_status_history
from models.invitation_group_statuses import (
    invitation_group_status_id_from_label,
    invitation_group_status_label_from_id,
    normalize_invitation_group_status,
)
from services.attendees import AttendeesService
from services.invitations import InvitationsService
from pathlib import Path
from models.invitation_groups import Invitation_groups
from services.email_service import EmailService
from services.facial_biometrics import FacialBiometricsService

logger = logging.getLogger(__name__)


class InvitationGroupsService:
    """Service layer for Invitation Groups operations"""

    DEFAULT_EMAIL_TEMPLATE = (
        "Hola {{nombre}},\n\n"
        "Tu invitacion para el evento {{evento}} ha sido creada.\n"
        "Link de registro: {{link}}\n\n"
        "Gracias,\n"
        "EventAccess"
    )
    DEFAULT_QR_EMAIL_TEMPLATE = (
        "<p>Hola {{nombre}},</p>"
        "<p>Tu registro fue aprobado. Presenta este QR en el ingreso.</p>"
        "<p><strong>Evento:</strong> {{evento}}</p>"
        "<p><strong>Link:</strong> {{link}}</p>"
        "<p><img src=\"{{qr_image}}\" alt=\"QR de acceso\" style=\"max-width:240px;\" /></p>"
        "<p>Gracias,<br/>EventAccess</p>"
    )
    DEFAULT_UPDATE_EMAIL_TEMPLATE = (
        "<p>Hola {{nombre}},</p>"
        "<p>Se habilito una correccion en tu registro para el evento <strong>{{evento}}</strong>.</p>"
        "<p><strong>Motivo:</strong> {{motivo}}</p>"
        "<p>Puedes actualizar tu informacion aqui: <a href=\"{{link}}\">{{link}}</a></p>"
        "<p>Gracias,<br/>EventAccess</p>"
    )

    def __init__(self, db: AsyncSession):
        self.db = db
        self.upload_dir = Path("uploads") / "invitation_groups"
        self._attendees_service = AttendeesService(self.db)

    @staticmethod
    def _status_label(obj: Invitation_groups, default: str = "Pendiente completar") -> str:
        if getattr(obj, "status_id", None):
            return invitation_group_status_label_from_id(obj.status_id, default=default)
        return normalize_invitation_group_status(getattr(obj, "status", None), default=default)

    @staticmethod
    def _set_status(obj: Invitation_groups, label: str) -> None:
        canonical = normalize_invitation_group_status(label, default="Pendiente completar")
        obj.status_id = invitation_group_status_id_from_label(canonical, default="Pendiente completar")
        # Legacy text column kept for backward compatibility.
        obj.status = canonical

    @staticmethod
    def _build_link(token_plain: str, base_url: Optional[str] = None) -> str:
        resolved_base_url = (base_url or os.environ.get("FRONTEND_URL") or "http://localhost:3000").strip().rstrip("/")
        return f"{resolved_base_url}/registro/{token_plain}"

    @staticmethod
    def _generate_token() -> tuple[str, str]:
        token_plain = secrets.token_urlsafe(16)
        token_hash = hashlib.sha256(token_plain.encode("utf-8")).hexdigest()
        return token_plain, token_hash

    async def create(
        self, data: Dict[str, Any], user_id: str, frontend_base_url: Optional[str] = None
    ) -> Optional[Invitation_groups]:
        try:
            now = datetime.now(timezone.utc)
            token_plain, token_hash = self._generate_token()
            link = self._build_link(token_plain, base_url=frontend_base_url)

            companions = data.get("companions") or []
            await self._validate_unique_ids_for_event(
                event_id=data.get("event_id"),
                titular_id=data.get("titular_identification", ""),
                companions=companions or [],
            )

            payload = {
                **data,
                "created_by": user_id,
                "created_at": data.get("created_at") or now,
                "updated_at": data.get("updated_at") or now,
                "status_id": invitation_group_status_id_from_label(
                    data.get("status"), default="Pendiente completar"
                ),
                "status": normalize_invitation_group_status(
                    data.get("status"), default="Pendiente completar"
                ),
                "token": token_hash,
                "token_plain": token_plain,
                "link": link,
                "companions": None,
            }

            obj = Invitation_groups(**payload)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            await self._replace_companions(obj.id, companions)
            await self._record_status_change(
                invitation_group_id=obj.id,
                from_status_id=None,
                to_status_id=obj.status_id,
                changed_by=user_id,
                payload={"action": "create"},
            )
            await self.db.commit()
            logger.info(f"Created invitation group with id: {obj.id}")
            email_sent = await self._send_email_if_needed(obj, companions or [])
            if email_sent:
                obj.email_sent_at = datetime.now(timezone.utc)
                await self.db.commit()
                await self.db.refresh(obj)
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating invitation group: {str(e)}")
            raise

    async def update_group(
        self,
        invitation_id: int,
        data: Dict[str, Any],
        user_id: str,
        frontend_base_url: Optional[str] = None,
    ) -> Optional[Invitation_groups]:
        result = await self.db.execute(select(Invitation_groups).where(Invitation_groups.id == invitation_id))
        obj = result.scalar_one_or_none()
        if not obj:
            return None

        current_status = self._status_label(obj, default="Pendiente completar")
        editable_statuses = {
            "Pendiente completar",
            "En registro",
            "Pendiente aprobación",
            "Pendiente de actualización",
            "Rechazado",
        }
        if current_status not in editable_statuses:
            raise ValueError(
                "La invitación no se puede editar en el estado actual. Usa 'Habilitar actualización'."
            )

        existing_companions = await self._load_companions(obj)
        companions = data.get("companions")
        if companions is None:
            companions = existing_companions

        target_event_id = data.get("event_id", obj.event_id)
        target_group_size = int(data.get("group_size", obj.group_size))
        if target_group_size < 1:
            raise ValueError("El cupo total debe ser mayor o igual a 1.")
        if len(companions or []) > max(0, target_group_size - 1):
            raise ValueError("La cantidad de acompañantes excede el cupo total configurado.")

        old_titular_name = (obj.titular_name or "").strip().lower()
        old_titular_id = (obj.titular_identification or "").strip().lower()
        new_titular_name = str(data.get("titular_name", obj.titular_name) or "").strip().lower()
        new_titular_id = str(data.get("titular_identification", obj.titular_identification) or "").strip().lower()

        await self._validate_unique_ids_for_event(
            event_id=target_event_id,
            titular_id=data.get("titular_identification", obj.titular_identification),
            companions=companions or [],
            ignore_invitation_id=obj.id,
        )

        previous_status_id = obj.status_id or invitation_group_status_id_from_label(
            current_status, default="Pendiente completar"
        )

        event_changed = target_event_id != obj.event_id
        group_size_changed = target_group_size != obj.group_size
        titular_identity_changed = (old_titular_id != new_titular_id) or (old_titular_name != new_titular_name)
        flags_changed = any(
            k in data for k in ("send_email", "send_email_cc", "intransferible")
        )

        changed_fields: list[str] = []
        for field in (
            "event_id",
            "titular_name",
            "titular_identification",
            "fingerprint_code",
            "email",
            "phone",
            "group_size",
            "send_email",
            "send_email_cc",
            "intransferible",
            "companions",
        ):
            if field in data:
                changed_fields.append(field)

        obj.titular_name = data.get("titular_name", obj.titular_name)
        obj.titular_identification = data.get("titular_identification", obj.titular_identification)
        obj.fingerprint_code = data.get("fingerprint_code", obj.fingerprint_code)
        obj.email = data.get("email", obj.email)
        obj.phone = data.get("phone", obj.phone)
        obj.event_id = target_event_id
        obj.group_size = target_group_size
        obj.send_email = bool(data.get("send_email", obj.send_email))
        obj.send_email_cc = bool(data.get("send_email_cc", obj.send_email_cc))
        obj.intransferible = bool(data.get("intransferible", obj.intransferible))
        obj.updated_at = datetime.now(timezone.utc)

        companion_identity_changed = False
        for idx, comp in enumerate(companions or []):
            old = existing_companions[idx] if idx < len(existing_companions) else {}
            if not isinstance(old, dict):
                old = {}
            old_name = str(old.get("name") or "").strip().lower()
            old_id = str(old.get("cedula") or "").strip().lower()
            new_name = str(comp.get("name") or "").strip().lower()
            new_id = str(comp.get("cedula") or "").strip().lower()
            if old_name != new_name or old_id != new_id:
                companion_identity_changed = True
                comp["selfie_url"] = None
                comp["doc_url"] = None
                comp["approved"] = None
                comp["rejection_reason"] = None
                comp["qr_token"] = None
                comp["qr_sent_at"] = None

        sensitive_change = bool(
            event_changed or group_size_changed or titular_identity_changed or companion_identity_changed
        )

        if titular_identity_changed:
            obj.titular_selfie_url = None
            obj.titular_doc_url = None
            obj.titular_approved = None
            obj.titular_rejection_reason = None
            obj.titular_qr_token = None
            obj.titular_qr_sent_at = None

        if sensitive_change:
            obj.titular_approved = None
            obj.titular_rejection_reason = None
            obj.titular_qr_token = None
            obj.titular_qr_sent_at = None
            companions = [
                {
                    **comp,
                    "approved": None,
                    "rejection_reason": None,
                    "qr_token": None,
                    "qr_sent_at": None,
                }
                for comp in (companions or [])
            ]

        await self._replace_companions(obj.id, companions or [])

        regenerate_link = True
        token_plain, token_hash = self._generate_token()
        obj.token_plain = token_plain
        obj.token = token_hash
        obj.link = self._build_link(token_plain, base_url=frontend_base_url)
        obj.email_sent_at = None

        # If it was waiting decision or had sensitive change, move to update pending.
        if current_status == "Pendiente aprobación" or sensitive_change:
            self._set_status(obj, "Pendiente de actualización")

        await self._record_status_change(
            invitation_group_id=obj.id,
            from_status_id=previous_status_id,
            to_status_id=obj.status_id,
            changed_by=user_id,
            payload={
                "action": "admin_edit",
                "changed_fields": changed_fields,
                "sensitive_change": sensitive_change,
                "flags_changed": flags_changed,
                "regenerated_link": True,
            },
        )

        await self.db.commit()
        await self.db.refresh(obj)

        return obj

    async def _send_email_if_needed(self, obj: Invitation_groups, companions: list[dict]) -> bool:
        if not obj.send_email:
            return False
        if not obj.email:
            logger.warning("Invitacion creada sin email del titular. No se enviara correo.")
            return False

        event_name = f"Evento {obj.event_id}"
        event_date = ""
        try:
            result = await self.db.execute(select(Events).where(Events.id == obj.event_id))
            event = result.scalar_one_or_none()
            if event:
                event_name = event.name or event_name
                if event.event_date:
                    event_date = event.event_date.strftime("%Y-%m-%d")
        except Exception as exc:
            logger.warning(f"No se pudo obtener evento {obj.event_id}: {exc}")

        template = os.environ.get("INVITATION_EMAIL_TEMPLATE", self.DEFAULT_EMAIL_TEMPLATE)
        values = {
            "nombre": obj.titular_name or "",
            "link": obj.link or "",
            "evento": event_name,
            "fecha": event_date,
        }

        companion_emails: list[str] = []
        if obj.send_email_cc and companions:
            companion_emails = [c.get("email", "") for c in companions if isinstance(c, dict)]

        subject = os.environ.get("INVITATION_EMAIL_SUBJECT", "Tu invitacion a EventAccess")
        result = await run_in_threadpool(
            EmailService.send_invitation_email,
            obj.email,
            subject,
            template,
            values,
            [],
            [],
        )
        if not result:
            return False

        if companion_emails:
            for comp in companions:
                comp_email = comp.get("email", "")
                if not comp_email:
                    continue
                comp_values = {
                    **values,
                    "nombre": comp.get("name", "") or values.get("nombre", ""),
                }
                await run_in_threadpool(
                    EmailService.send_invitation_email,
                    comp_email,
                    subject,
                    template,
                    comp_values,
                    [],
                    [],
                )
        return bool(result)

    @staticmethod
    def _build_qr_data_url(payload: str) -> str:
        qr = qrcode.QRCode(box_size=6, border=2)
        qr.add_data(payload)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{encoded}"

    @staticmethod
    def _build_qr_png(payload: str) -> bytes:
        qr = qrcode.QRCode(box_size=6, border=2)
        qr.add_data(payload)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        return buffer.getvalue()

    async def _send_qr_email(self, obj: Invitation_groups, companions: list[dict]) -> bool:
        if not obj.email:
            return False

        companions = await self._load_companions(obj)
        companions, tokens_changed = await self._ensure_qr_tokens(obj, companions)
        await self._ensure_individual_invitations(obj, companions)

        event_name = f"Evento {obj.event_id}"
        event_date = ""
        try:
            result = await self.db.execute(select(Events).where(Events.id == obj.event_id))
            event = result.scalar_one_or_none()
            if event:
                event_name = event.name or event_name
                if event.event_date:
                    event_date = event.event_date.strftime("%Y-%m-%d")
        except Exception as exc:
            logger.warning(f"No se pudo obtener evento {obj.event_id}: {exc}")

        link = obj.link or self._build_link(obj.token_plain or "")

        subject = os.environ.get("INVITATION_QR_EMAIL_SUBJECT", "Tu QR de acceso")
        template = os.environ.get("INVITATION_QR_EMAIL_TEMPLATE", self.DEFAULT_QR_EMAIL_TEMPLATE)

        # Titular
        titular_qr_value = obj.titular_qr_token or obj.token_plain or ""
        qr_bytes = self._build_qr_png(titular_qr_value)
        qr_cid = f"qr-{secrets.token_hex(8)}"
        values = {
            "nombre": obj.titular_name or "",
            "link": link,
            "evento": event_name,
            "fecha": event_date,
            "qr_image": f"cid:{qr_cid}",
        }
        inline_attachments = [
            {
                "content": qr_bytes,
                "maintype": "image",
                "subtype": "png",
                "cid": qr_cid,
                "filename": "qr.png",
            }
        ]

        result = await run_in_threadpool(
            EmailService.send_invitation_email,
            obj.email,
            subject,
            template,
            values,
            [],
            [],
            inline_attachments,
        )
        if not result:
            return False

        obj.titular_qr_sent_at = datetime.now(timezone.utc)

        if companions:
            for comp in companions:
                comp_email = comp.get("email", "")
                if not comp_email:
                    continue
                comp_qr_value = comp.get("qr_token") or obj.token_plain or ""
                comp_qr_bytes = self._build_qr_png(comp_qr_value)
                comp_qr_cid = f"qr-{secrets.token_hex(8)}"
                comp_values = {
                    "nombre": comp.get("name", "") or values.get("nombre", ""),
                    "link": link,
                    "evento": event_name,
                    "fecha": event_date,
                    "qr_image": f"cid:{comp_qr_cid}",
                }
                comp_inline_attachments = [
                    {
                        "content": comp_qr_bytes,
                        "maintype": "image",
                        "subtype": "png",
                        "cid": comp_qr_cid,
                        "filename": "qr.png",
                    }
                ]
                await run_in_threadpool(
                    EmailService.send_invitation_email,
                    comp_email,
                    subject,
                    template,
                    comp_values,
                    [],
                    [],
                    comp_inline_attachments,
                )
                comp["qr_sent_at"] = datetime.now(timezone.utc).isoformat()

        if tokens_changed:
            await self.db.commit()
            await self.db.refresh(obj)
        return True

    async def resend_email(self, invitation_id: int) -> Optional[Invitation_groups]:
        result = await self.db.execute(select(Invitation_groups).where(Invitation_groups.id == invitation_id))
        obj = result.scalar_one_or_none()
        if not obj:
            return None

        companions = await self._load_companions(obj)

        email_sent = await self._send_email_if_needed(obj, companions)
        if email_sent:
            obj.email_sent_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(obj)
        return obj

    async def approve_group(
        self,
        invitation_id: int,
        approved: bool,
        rejection_reason: str | None = None,
        participants: list[dict] | None = None,
        changed_by: str = "system",
    ) -> Optional[Invitation_groups]:
        result = await self.db.execute(select(Invitation_groups).where(Invitation_groups.id == invitation_id))
        obj = result.scalar_one_or_none()
        if not obj:
            return None

        previous_status_id = obj.status_id or invitation_group_status_id_from_label(
            self._status_label(obj, default="Pendiente completar"),
            default="Pendiente completar",
        )
        companions = await self._load_companions(obj)

        # Per-person approval flow
        if participants:
            await self._apply_participant_decisions(obj, companions, participants)
            companions, _ = await self._ensure_qr_tokens(obj, companions)
            await self._ensure_individual_invitations(obj, companions)
            obj.updated_at = datetime.now(timezone.utc)
            await self._record_status_change(
                invitation_group_id=obj.id,
                from_status_id=previous_status_id,
                to_status_id=obj.status_id,
                changed_by=changed_by,
                reason=rejection_reason,
                payload={"action": "participant_decision", "participants": participants},
            )
            await self.db.commit()
            await self.db.refresh(obj)
            await self._send_qr_email_selected(obj, companions, participants)
            return obj

        # Legacy group-level approval flow
        self._set_status(obj, "Aprobado" if approved else "Rechazado")
        if rejection_reason:
            obj.rejection_reason = rejection_reason if hasattr(obj, "rejection_reason") else None
        obj.updated_at = datetime.now(timezone.utc)
        await self._record_status_change(
            invitation_group_id=obj.id,
            from_status_id=previous_status_id,
            to_status_id=obj.status_id,
            changed_by=changed_by,
            reason=rejection_reason,
            payload={"action": "group_decision", "approved": approved},
        )
        await self.db.commit()
        await self.db.refresh(obj)

        if approved:
            companions, _ = await self._ensure_qr_tokens(obj, companions)
            await self._ensure_individual_invitations(obj, companions)
            await self._send_qr_email(obj, companions)
        return obj

    async def _load_companions(self, obj: Invitation_groups) -> list[dict]:
        return await self.get_companions_payload(obj.id)

    def _resolve_person_state(
        self,
        approved: Optional[bool],
        rejection_reason: Optional[str],
        selfie_url: Optional[str],
        doc_url: Optional[str],
    ) -> str:
        if approved is True:
            return "approved"
        if rejection_reason:
            return "rejected"
        if selfie_url and doc_url:
            return "pending"
        return "pending"

    @staticmethod
    def _resolve_group_status(states: list[str]) -> str:
        """Derive group status from individual states."""
        approved_count = sum(1 for state in states if state == "approved")
        rejected_count = sum(1 for state in states if state == "rejected")
        pending_count = sum(1 for state in states if state == "pending")

        if approved_count == 0 and rejected_count == 0:
            return "Pendiente aprobación"
        if pending_count > 0 and approved_count > 0:
            return "Aprobado parcial"
        if pending_count > 0 and approved_count == 0 and rejected_count > 0:
            return "Pendiente aprobación"
        if pending_count == 0 and approved_count > 0 and rejected_count > 0:
            return "Aprobado parcial"
        if pending_count == 0 and approved_count > 0:
            return "Aprobado"
        return "Rechazado"

    async def _record_status_change(
        self,
        invitation_group_id: int,
        from_status_id: Optional[int],
        to_status_id: int,
        changed_by: str,
        reason: Optional[str] = None,
        payload: Optional[dict] = None,
    ) -> None:
        entry = Invitation_group_status_history(
            invitation_group_id=invitation_group_id,
            from_status_id=from_status_id,
            to_status_id=to_status_id,
            from_status=invitation_group_status_label_from_id(from_status_id) if from_status_id else None,
            to_status=invitation_group_status_label_from_id(to_status_id),
            changed_by=changed_by,
            reason=reason,
            payload=json.dumps(payload, ensure_ascii=False) if payload else None,
            changed_at=datetime.now(timezone.utc),
        )
        self.db.add(entry)

    async def request_update(
        self,
        invitation_id: int,
        updated_by: str,
        reason: Optional[str] = None,
        participants: Optional[list[dict]] = None,
    ) -> Optional[Invitation_groups]:
        """Reopen an approved group so participants can update biometrics/docs."""
        result = await self.db.execute(select(Invitation_groups).where(Invitation_groups.id == invitation_id))
        obj = result.scalar_one_or_none()
        if not obj:
            return None

        current_status = self._status_label(obj, default="Pendiente completar")
        if current_status not in {"Aprobado", "Aprobado parcial", "Pendiente aprobación"}:
            raise ValueError(
                "La invitación debe estar en estado Aprobado, Aprobado parcial o Pendiente aprobación."
            )
        invalidate_previous_approvals = current_status in {"Aprobado", "Aprobado parcial"}

        companions = await self._load_companions(obj)
        now = datetime.now(timezone.utc)

        affected_titular = False
        affected_companion_indexes: set[int] = set()

        if participants:
            for participant in participants:
                role = (participant.get("role") or "").lower()
                if role == "titular":
                    affected_titular = True
                elif role == "acompanante":
                    idx = participant.get("index")
                    if idx is None or not isinstance(idx, int) or idx < 0 or idx >= len(companions):
                        raise ValueError("Acompañante inválido.")
                    affected_companion_indexes.add(idx)
                else:
                    raise ValueError("Rol inválido.")
        else:
            affected_titular = True
            affected_companion_indexes = set(range(len(companions)))

        affected: list[dict] = []

        if affected_titular:
            affected.append(
                {
                    "role": "titular",
                    "index": None,
                    "name": obj.titular_name,
                    "cedula": obj.titular_identification,
                    "previous_approved": obj.titular_approved,
                    "previous_rejection_reason": obj.titular_rejection_reason,
                }
            )
            if invalidate_previous_approvals:
                obj.titular_approved = None
                obj.titular_rejection_reason = None

        for idx in sorted(affected_companion_indexes):
            comp = companions[idx]
            if not isinstance(comp, dict):
                continue
            affected.append(
                {
                    "role": "acompanante",
                    "index": idx,
                    "name": comp.get("name"),
                    "cedula": comp.get("cedula"),
                    "previous_approved": comp.get("approved"),
                    "previous_rejection_reason": comp.get("rejection_reason"),
                }
            )
            if invalidate_previous_approvals:
                comp["approved"] = None
                comp.pop("rejection_reason", None)
            companions[idx] = comp

        await self._replace_companions(obj.id, companions)

        previous_status_id = obj.status_id or invitation_group_status_id_from_label(
            current_status, default="Pendiente completar"
        )
        self._set_status(obj, "Pendiente de actualización")
        obj.updated_at = now

        await self._record_status_change(
            invitation_group_id=obj.id,
            from_status_id=previous_status_id,
            to_status_id=obj.status_id,
            changed_by=updated_by,
            reason=reason,
            payload={"action": "reopen_update", "affected": affected},
        )

        await self.db.commit()
        await self.db.refresh(obj)
        await self._send_update_email_to_affected(obj, companions, affected, reason)
        return obj

    async def _send_update_email_to_affected(
        self,
        obj: Invitation_groups,
        companions: list[dict],
        affected: list[dict],
        reason: Optional[str],
    ) -> None:
        if not affected:
            return

        event_name = f"Evento {obj.event_id}"
        try:
            result = await self.db.execute(select(Events).where(Events.id == obj.event_id))
            event = result.scalar_one_or_none()
            if event and event.name:
                event_name = event.name
        except Exception as exc:
            logger.warning(f"No se pudo obtener evento {obj.event_id} para correo de correccion: {exc}")

        subject = "Correccion habilitada en tu invitacion"
        template = self.DEFAULT_UPDATE_EMAIL_TEMPLATE
        reason_text = (reason or "").strip() or "Actualiza tus documentos o datos para continuar con la revision."
        link = obj.link or self._build_link(obj.token_plain or "")

        for person in affected:
            role = (person.get("role") or "").lower()
            name = person.get("name") or ""
            recipient = ""
            if role == "titular":
                recipient = (obj.email or "").strip()
                if not name:
                    name = obj.titular_name or ""
            elif role == "acompanante":
                idx = person.get("index")
                if idx is None or not isinstance(idx, int) or idx < 0 or idx >= len(companions):
                    continue
                comp = companions[idx] if isinstance(companions[idx], dict) else {}
                recipient = str(comp.get("email") or "").strip()
                if not name:
                    name = comp.get("name") or "Acompañante"
            if not recipient:
                continue

            values = {
                "nombre": str(name or "").strip() or "Invitado",
                "evento": event_name,
                "motivo": reason_text,
                "link": link,
            }
            await run_in_threadpool(
                EmailService.send_invitation_email,
                recipient,
                subject,
                template,
                values,
                [],
                [],
            )

    async def _apply_participant_decisions(
        self,
        obj: Invitation_groups,
        companions: list[dict],
        participants: list[dict],
    ) -> None:
        # Apply approvals/rejections for each participant
        for decision in participants:
            role = (decision.get("role") or "").lower()
            is_approved = bool(decision.get("approved"))
            reason = (decision.get("rejection_reason") or "").strip() or None

            if role == "titular":
                if is_approved and not (obj.titular_selfie_url and obj.titular_doc_url):
                    raise ValueError("El titular aún no tiene documentos completos.")
                obj.titular_approved = is_approved
                obj.titular_rejection_reason = None if is_approved else reason
            elif role == "acompanante":
                idx = decision.get("index")
                if idx is None or not isinstance(idx, int) or idx < 0 or idx >= len(companions):
                    raise ValueError("Acompañante inválido.")
                comp = companions[idx]
                if is_approved and not (comp.get("selfie_url") and comp.get("doc_url")):
                    raise ValueError("El acompañante aún no tiene documentos completos.")
                comp["approved"] = is_approved
                if is_approved:
                    comp.pop("rejection_reason", None)
                else:
                    comp["rejection_reason"] = reason
                companions[idx] = comp

        await self._replace_companions(obj.id, companions)

        # Determine group status
        statuses: list[str] = []
        statuses.append(
            self._resolve_person_state(
                obj.titular_approved,
                obj.titular_rejection_reason,
                obj.titular_selfie_url,
                obj.titular_doc_url,
            )
        )
        for comp in companions:
            statuses.append(
                self._resolve_person_state(
                    comp.get("approved"),
                    comp.get("rejection_reason"),
                    comp.get("selfie_url"),
                    comp.get("doc_url"),
                )
            )

        self._set_status(obj, self._resolve_group_status(statuses))

    async def _send_qr_email_selected(
        self,
        obj: Invitation_groups,
        companions: list[dict],
        participants: list[dict],
    ) -> None:
        if not participants:
            return

        event_name = f"Evento {obj.event_id}"
        event_date = ""
        try:
            result = await self.db.execute(select(Events).where(Events.id == obj.event_id))
            event = result.scalar_one_or_none()
            if event:
                event_name = event.name or event_name
                if event.event_date:
                    event_date = event.event_date.strftime("%Y-%m-%d")
        except Exception as exc:
            logger.warning(f"No se pudo obtener evento {obj.event_id}: {exc}")

        link = obj.link or self._build_link(obj.token_plain or "")
        companions = await self._load_companions(obj)
        companions, tokens_changed = await self._ensure_qr_tokens(obj, companions)
        await self._ensure_individual_invitations(obj, companions)
        subject = os.environ.get("INVITATION_QR_EMAIL_SUBJECT", "Tu QR de acceso")
        template = os.environ.get("INVITATION_QR_EMAIL_TEMPLATE", self.DEFAULT_QR_EMAIL_TEMPLATE)

        touched = False
        for decision in participants:
            if not decision.get("approved"):
                continue
            role = (decision.get("role") or "").lower()
            if role == "titular":
                if not obj.email:
                    continue
                qr_value = obj.titular_qr_token or obj.token_plain or ""
                qr_bytes = self._build_qr_png(qr_value)
                qr_cid = f"qr-{secrets.token_hex(8)}"
                inline_attachments = [
                    {
                        "content": qr_bytes,
                        "maintype": "image",
                        "subtype": "png",
                        "cid": qr_cid,
                        "filename": "qr.png",
                    }
                ]
                values = {
                    "nombre": obj.titular_name or "",
                    "link": link,
                    "evento": event_name,
                    "fecha": event_date,
                    "qr_image": f"cid:{qr_cid}",
                }
                await run_in_threadpool(
                    EmailService.send_invitation_email,
                    obj.email,
                    subject,
                    template,
                    values,
                    [],
                    [],
                    inline_attachments,
                )
                obj.titular_qr_sent_at = datetime.now(timezone.utc)
                touched = True
            elif role == "acompanante":
                idx = decision.get("index")
                if idx is None or not isinstance(idx, int) or idx < 0 or idx >= len(companions):
                    continue
                comp = companions[idx]
                comp_email = comp.get("email", "")
                if not comp_email:
                    continue
                comp_qr_value = comp.get("qr_token") or obj.token_plain or ""
                comp_qr_bytes = self._build_qr_png(comp_qr_value)
                comp_qr_cid = f"qr-{secrets.token_hex(8)}"
                comp_inline_attachments = [
                    {
                        "content": comp_qr_bytes,
                        "maintype": "image",
                        "subtype": "png",
                        "cid": comp_qr_cid,
                        "filename": "qr.png",
                    }
                ]
                values = {
                    "nombre": comp.get("name", "") or obj.titular_name or "",
                    "link": link,
                    "evento": event_name,
                    "fecha": event_date,
                    "qr_image": f"cid:{comp_qr_cid}",
                }
                await run_in_threadpool(
                    EmailService.send_invitation_email,
                    comp_email,
                    subject,
                    template,
                    values,
                    [],
                    [],
                    comp_inline_attachments,
                )
                comp["qr_sent_at"] = datetime.now(timezone.utc).isoformat()

        await self._replace_companions(obj.id, companions)
        if touched:
            await self.db.commit()
            await self.db.refresh(obj)
        elif tokens_changed:
            await self.db.commit()
            await self.db.refresh(obj)

    async def _ensure_qr_tokens(
        self,
        obj: Invitation_groups,
        companions: list[dict],
    ) -> tuple[list[dict], bool]:
        changed = False
        if not obj.titular_qr_token:
            obj.titular_qr_token = secrets.token_urlsafe(16)
            changed = True

        updated = []
        for comp in companions:
            if not isinstance(comp, dict):
                updated.append(comp)
                continue
            if not comp.get("qr_token"):
                comp["qr_token"] = secrets.token_urlsafe(16)
                changed = True
            updated.append(comp)

        if changed:
            await self._replace_companions(obj.id, updated)
        return updated, changed

    @staticmethod
    def _resolve_invitation_status(approved: Optional[bool], rejection_reason: Optional[str]) -> str:
        if approved is True:
            return "APROBADO"
        if rejection_reason:
            return "RECHAZADO"
        return "PENDIENTE"

    async def _ensure_individual_invitations(
        self,
        obj: Invitation_groups,
        companions: list[dict],
    ) -> None:
        """Ensure each participant has a real invitation tied to their QR token."""
        invitations_service = InvitationsService(self.db)
        now = datetime.now(timezone.utc)

        async def ensure_person(
            *,
            token_plain: Optional[str],
            identification: Optional[str],
            full_name: Optional[str],
            email: Optional[str],
            phone: Optional[str],
            id_document_url: Optional[str],
            face_photo_url: Optional[str],
            fingerprint_code: Optional[str],
            approved: Optional[bool],
            rejection_reason: Optional[str],
        ) -> None:
            if not token_plain or not identification or not full_name:
                return

            attendee = await self._get_or_create_attendee(
                identification=identification,
                full_name=full_name,
                email=email,
                phone=phone,
                fingerprint_code=fingerprint_code,
                user_id=obj.created_by,
            )
            if attendee:
                updates: dict[str, Any] = {}
                if id_document_url and (not attendee.id_document_url or attendee.id_document_url != id_document_url):
                    updates["id_document_url"] = id_document_url
                if face_photo_url and (not attendee.face_photo_url or attendee.face_photo_url != face_photo_url):
                    updates["face_photo_url"] = face_photo_url
                if updates:
                    updates["updated_at"] = now
                    await self._attendees_service.update(attendee.id, updates)

            status = self._resolve_invitation_status(approved, rejection_reason)
            invitation = await invitations_service.get_by_field("token_plain", token_plain)
            if invitation:
                if invitation.status == "USADO":
                    return
                update_data: dict[str, Any] = {
                    "event_id": obj.event_id,
                    "attendee_id": attendee.id,
                    "status": status,
                    "biometric_photo": face_photo_url,
                    "updated_at": now,
                }
                if status == "APROBADO" and not invitation.approved_at:
                    update_data["approved_at"] = now
                await invitations_service.update(invitation.id, update_data)
                return

            token_hash = hashlib.sha256(token_plain.encode("utf-8")).hexdigest()
            data = {
                "event_id": obj.event_id,
                "attendee_id": attendee.id,
                "token": token_hash,
                "token_plain": token_plain,
                "status": status,
                "biometric_photo": face_photo_url,
                "created_at": now,
                "updated_at": now,
            }
            if status == "APROBADO":
                data["approved_at"] = now
            await invitations_service.create(data, obj.created_by)

        await ensure_person(
            token_plain=obj.titular_qr_token,
            identification=obj.titular_identification,
            full_name=obj.titular_name,
            email=obj.email,
            phone=obj.phone,
            id_document_url=obj.titular_doc_url,
            face_photo_url=obj.titular_selfie_url,
            fingerprint_code=obj.fingerprint_code,
            approved=obj.titular_approved,
            rejection_reason=obj.titular_rejection_reason,
        )

        for comp in companions:
            if not isinstance(comp, dict):
                continue
            await ensure_person(
                token_plain=comp.get("qr_token"),
                identification=comp.get("cedula"),
                full_name=comp.get("name"),
                email=comp.get("email"),
                phone=comp.get("telefono"),
                id_document_url=comp.get("doc_url"),
                face_photo_url=comp.get("selfie_url"),
                fingerprint_code=comp.get("codigo"),
                approved=comp.get("approved"),
                rejection_reason=comp.get("rejection_reason"),
            )

    async def get_list(self, skip: int = 0, limit: int = 50) -> Dict[str, Any]:
        try:
            query = select(Invitation_groups).order_by(Invitation_groups.id.desc())
            count_query = select(func.count(Invitation_groups.id))
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {"items": items, "total": total, "skip": skip, "limit": limit}
        except Exception as e:
            logger.error(f"Error fetching invitation groups list: {str(e)}")
            raise

    async def get_by_token(self, token_plain: str) -> Optional[Invitation_groups]:
        result = await self.db.execute(
            select(Invitation_groups).where(Invitation_groups.token_plain == token_plain)
        )
        return result.scalar_one_or_none()

    async def get_status_history(self, invitation_id: int) -> list[Invitation_group_status_history]:
        result = await self.db.execute(
            select(Invitation_group_status_history)
            .where(Invitation_group_status_history.invitation_group_id == invitation_id)
            .order_by(Invitation_group_status_history.changed_at.desc())
        )
        return result.scalars().all()

    async def get_status_history_list(
        self,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        event_id: Optional[int] = None,
        to_status: Optional[str] = None,
    ) -> Dict[str, Any]:
        base_query = (
            select(
                Invitation_group_status_history,
                Invitation_groups,
                Events,
            )
            .join(
                Invitation_groups,
                Invitation_groups.id == Invitation_group_status_history.invitation_group_id,
            )
            .outerjoin(Events, Events.id == Invitation_groups.event_id)
        )
        count_query = (
            select(func.count(Invitation_group_status_history.id))
            .select_from(Invitation_group_status_history)
            .join(
                Invitation_groups,
                Invitation_groups.id == Invitation_group_status_history.invitation_group_id,
            )
            .outerjoin(Events, Events.id == Invitation_groups.event_id)
        )

        if event_id:
            base_query = base_query.where(Invitation_groups.event_id == event_id)
            count_query = count_query.where(Invitation_groups.event_id == event_id)

        if search:
            like_value = f"%{search.strip()}%"
            base_query = base_query.where(
                (Invitation_groups.titular_name.ilike(like_value))
                | (Invitation_groups.titular_identification.ilike(like_value))
                | (Invitation_group_status_history.changed_by.ilike(like_value))
            )
            count_query = count_query.where(
                (Invitation_groups.titular_name.ilike(like_value))
                | (Invitation_groups.titular_identification.ilike(like_value))
                | (Invitation_group_status_history.changed_by.ilike(like_value))
            )

        if to_status:
            normalized = normalize_invitation_group_status(
                to_status, default=to_status.strip() if to_status.strip() else "Pendiente completar"
            )
            status_id = invitation_group_status_id_from_label(
                normalized, default="Pendiente completar"
            )
            base_query = base_query.where(Invitation_group_status_history.to_status_id == status_id)
            count_query = count_query.where(Invitation_group_status_history.to_status_id == status_id)

        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        rows_result = await self.db.execute(
            base_query
            .order_by(Invitation_group_status_history.changed_at.desc())
            .offset(skip)
            .limit(limit)
        )
        rows = rows_result.all()

        return {
            "items": rows,
            "total": total,
            "skip": skip,
            "limit": limit,
        }

    def _save_file(self, content: bytes, filename: str) -> str:
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = self.upload_dir / filename
        file_path.write_bytes(content)
        return str(file_path).replace("\\", "/")

    async def get_companions_payload(self, invitation_group_id: int) -> list[dict]:
        result = await self.db.execute(
            select(Invitation_group_people)
            .where(Invitation_group_people.invitation_group_id == invitation_group_id)
            .order_by(Invitation_group_people.person_index.asc())
        )
        rows = result.scalars().all()
        return [
            {
                "name": row.name or "",
                "cedula": row.cedula or "",
                "email": row.email or "",
                "telefono": row.telefono or "",
                "codigo": row.codigo or "",
                "selfie_url": row.selfie_url,
                "doc_url": row.doc_url,
                "approved": row.approved,
                "rejection_reason": row.rejection_reason,
                "qr_token": row.qr_token,
                "qr_sent_at": row.qr_sent_at.isoformat() if row.qr_sent_at else None,
            }
            for row in rows
        ]

    async def _replace_companions(self, invitation_group_id: int, companions: list[dict]) -> None:
        await self.db.execute(
            delete(Invitation_group_people).where(
                Invitation_group_people.invitation_group_id == invitation_group_id
            )
        )
        now = datetime.now(timezone.utc)
        for idx, comp in enumerate(companions or []):
            if not isinstance(comp, dict):
                continue
            self.db.add(
                Invitation_group_people(
                    invitation_group_id=invitation_group_id,
                    person_index=idx,
                    name=comp.get("name"),
                    cedula=comp.get("cedula"),
                    email=comp.get("email"),
                    telefono=comp.get("telefono"),
                    codigo=comp.get("codigo"),
                    selfie_url=comp.get("selfie_url"),
                    doc_url=comp.get("doc_url"),
                    approved=comp.get("approved"),
                    rejection_reason=comp.get("rejection_reason"),
                    qr_token=comp.get("qr_token"),
                    qr_sent_at=datetime.fromisoformat(comp["qr_sent_at"])
                    if comp.get("qr_sent_at")
                    else None,
                    created_at=now,
                    updated_at=now,
                )
            )

    @staticmethod
    def _normalize_id(value: Optional[str]) -> str:
        return (value or "").strip().lower()

    @staticmethod
    def _extract_group_ids(titular_id: str, companions: list[dict]) -> list[str]:
        ids: list[str] = []
        if titular_id:
            ids.append(titular_id)
        for comp in companions or []:
            comp_id = InvitationGroupsService._normalize_id(comp.get("cedula"))
            if comp_id:
                ids.append(comp_id)
        return ids

    async def _validate_unique_ids_for_event(
        self,
        event_id: int,
        titular_id: str,
        companions: list[dict],
        ignore_invitation_id: Optional[int] = None,
    ) -> None:
        """Ensure IDs are unique within the group and not repeated in the same event."""
        normalized_titular = self._normalize_id(titular_id)
        group_ids = self._extract_group_ids(normalized_titular, companions)
        if len(group_ids) != len(set(group_ids)):
            raise ValueError("La cédula no puede repetirse dentro del mismo grupo.")

        result = await self.db.execute(
            select(Invitation_groups).where(Invitation_groups.event_id == event_id)
        )
        existing = result.scalars().all()
        for item in existing:
            if ignore_invitation_id and item.id == ignore_invitation_id:
                continue
            existing_ids: list[str] = []
            if item.titular_identification:
                existing_ids.append(self._normalize_id(item.titular_identification))
            comp_rows = await self.get_companions_payload(item.id)
            for comp in comp_rows:
                comp_id = self._normalize_id(comp.get("cedula"))
                if comp_id:
                    existing_ids.append(comp_id)
            if set(group_ids) & set(existing_ids):
                raise ValueError("La cédula ya está registrada en este evento.")

    async def upload_media_by_token(
        self,
        token_plain: str,
        role: str,
        kind: str,
        file_bytes: bytes,
        original_name: str,
        companion_index: int | None = None,
    ) -> Optional[Invitation_groups]:
        obj = await self.get_by_token(token_plain)
        if not obj:
            return None

        safe_name = original_name.replace(" ", "_")
        filename = f"{token_plain}_{role}_{kind}_{safe_name}"
        stored_path = self._save_file(file_bytes, filename)
        public_url = f"/api/v1/invitation-groups/public/files/{filename}"

        if role.lower() == "titular":
            if kind == "selfie":
                obj.titular_selfie_url = public_url
            elif kind == "doc":
                obj.titular_doc_url = public_url
        else:
            companions = await self._load_companions(obj)
            if companion_index is not None and 0 <= companion_index < len(companions):
                comp = companions[companion_index]
                if kind == "selfie":
                    comp["selfie_url"] = public_url
                elif kind == "doc":
                    comp["doc_url"] = public_url
                companions[companion_index] = comp
                await self._replace_companions(obj.id, companions)

        obj.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(obj)

        # Shadow mode: best-effort embedding extraction from selfie uploads.
        if kind == "selfie":
            try:
                biometric_service = FacialBiometricsService(self.db)
                person_id: Optional[int] = None
                source = "invitation_groups.public_upload.selfie"
                identification = None
                full_name = None
                email = None
                phone = None
                fingerprint_code = None
                if role.lower() == "titular":
                    identification = obj.titular_identification
                    full_name = obj.titular_name
                    email = obj.email
                    phone = obj.phone
                    fingerprint_code = obj.fingerprint_code
                    person_id = await biometric_service.resolve_person_id_by_identification(identification)
                    image_source = obj.titular_selfie_url or public_url
                else:
                    image_source = None
                    companions = await self._load_companions(obj)
                    if companion_index is not None and 0 <= companion_index < len(companions):
                        companion = companions[companion_index]
                        identification = companion.get("cedula")
                        full_name = companion.get("name")
                        email = companion.get("email")
                        phone = companion.get("telefono")
                        fingerprint_code = companion.get("codigo")
                        person_id = await biometric_service.resolve_person_id_by_identification(identification)
                        image_source = companion.get("selfie_url") or public_url
                if not person_id and identification:
                    try:
                        attendee = await self._get_or_create_attendee(
                            identification=identification,
                            full_name=full_name,
                            email=email,
                            phone=phone,
                            fingerprint_code=fingerprint_code,
                            user_id="public",
                        )
                        person_id = attendee.id if attendee else None
                    except Exception as exc:
                        logger.warning("No se pudo crear attendee para embedding: %s", exc)
                if person_id and image_source:
                    await biometric_service.register_embedding_for_person(
                        person_id=person_id,
                        image_input=image_source,
                        actor_user_id="public",
                        source=source,
                    )
                else:
                    await biometric_service._audit(
                        event_type="BIOMETRIC_EMBEDDING_SKIPPED",
                        actor_user_id="public",
                        details={
                            "source": source,
                            "reason": "PERSON_NOT_RESOLVED",
                            "role": role,
                            "companion_index": companion_index,
                        },
                        target_id=str(obj.id),
                    )
                    await self.db.commit()
            except Exception as exc:
                logger.warning("Embedding registration skipped for invitation group upload: %s", exc)
        return obj

    async def register_by_token(self, token_plain: str, payload: Dict[str, Any]) -> Optional[Invitation_groups]:
        obj = await self.get_by_token(token_plain)
        if not obj:
            return None

        previous_status_id = obj.status_id or invitation_group_status_id_from_label(
            self._status_label(obj, default="Pendiente completar"),
            default="Pendiente completar",
        )
        companions = payload.get("companions") or []
        await self._validate_unique_ids_for_event(
            event_id=obj.event_id,
            titular_id=payload.get("titular_identification", obj.titular_identification),
            companions=companions,
            ignore_invitation_id=obj.id,
        )

        obj.titular_name = payload.get("titular_name", obj.titular_name)
        obj.titular_identification = payload.get("titular_identification", obj.titular_identification)
        obj.email = payload.get("email", obj.email)
        obj.phone = payload.get("phone", obj.phone)
        obj.fingerprint_code = payload.get("fingerprint_code", obj.fingerprint_code)
        if payload.get("titular_selfie_url"):
            obj.titular_selfie_url = payload.get("titular_selfie_url")
        if payload.get("titular_doc_url"):
            obj.titular_doc_url = payload.get("titular_doc_url")
        await self._replace_companions(obj.id, companions)
        requested_status = payload.get("status")
        if requested_status:
            self._set_status(obj, requested_status)
        else:
            self._set_status(obj, "Pendiente aprobación")
        obj.updated_at = datetime.now(timezone.utc)
        await self._record_status_change(
            invitation_group_id=obj.id,
            from_status_id=previous_status_id,
            to_status_id=obj.status_id,
            changed_by="public",
            payload={"action": "public_register"},
        )

        await self.db.commit()
        await self.db.refresh(obj)

        # Create attendees records (best-effort)
        try:
            await self._get_or_create_attendee(
                identification=obj.titular_identification,
                full_name=obj.titular_name,
                email=obj.email,
                phone=obj.phone,
                fingerprint_code=obj.fingerprint_code,
                user_id="public",
            )
            for comp in companions:
                await self._get_or_create_attendee(
                    identification=comp.get("cedula", ""),
                    full_name=comp.get("name", ""),
                    email=comp.get("email", ""),
                    phone=comp.get("telefono", ""),
                    fingerprint_code=comp.get("codigo", ""),
                    user_id="public",
                )
        except Exception as exc:
            logger.warning(f"No se pudieron crear asistentes: {exc}")

        return obj

    async def _get_or_create_attendee(
        self,
        identification: Optional[str],
        full_name: Optional[str],
        email: Optional[str],
        phone: Optional[str],
        fingerprint_code: Optional[str],
        user_id: str,
    ) -> Optional[Any]:
        if not identification:
            return None
        normalized = identification.strip()
        if not normalized:
            return None
        attendee = await self._attendees_service.get_by_field("identification", normalized)
        now = datetime.now(timezone.utc)
        if attendee:
            updates: dict[str, Any] = {}
            if full_name and not attendee.full_name:
                updates["full_name"] = full_name
            if email and not attendee.email:
                updates["email"] = email
            if phone and not attendee.phone:
                updates["phone"] = phone
            if fingerprint_code and not attendee.fingerprint_code:
                updates["fingerprint_code"] = fingerprint_code
            if updates:
                updates["updated_at"] = now
                await self._attendees_service.update(attendee.id, updates)
            return attendee

        return await self._attendees_service.create(
            {
                "identification": normalized,
                "full_name": full_name or normalized,
                "email": email,
                "phone": phone,
                "fingerprint_code": fingerprint_code,
                "created_at": now,
                "updated_at": now,
            },
            user_id=user_id,
        )
