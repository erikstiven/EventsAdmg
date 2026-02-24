import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.invitation_status_history import Invitation_status_history
from models.invitations import Invitations

logger = logging.getLogger(__name__)


class InvitationsService:
    """Service layer for Invitations operations."""

    ALLOWED_TRANSITIONS = {
        "GENERADO": ["PENDIENTE_APROBACION"],
        "PENDIENTE_APROBACION": ["APROBADO", "RECHAZADO"],
        "APROBADO": ["USADO", "REVOCADO"],
        "RECHAZADO": [],
        "USADO": [],
        "REVOCADO": [],
    }

    GENERIC_PROTECTED_FIELDS = {
        "status",
        "token",
        "token_plain",
        "activation_code",
        "created_at",
        "approved_at",
        "approved_by",
        "rejection_reason",
        "used_at",
        "revoked_at",
        "revoked_by",
    }

    ALWAYS_IMMUTABLE_FIELDS = {"token", "token_plain", "activation_code", "created_at"}
    IMMUTABLE_AFTER_GENERATED_FIELDS = {"attendee_id", "event_id"}

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _normalize_datetime_fields(payload: Dict[str, Any]) -> Dict[str, Any]:
        normalized = dict(payload)
        for field in ("created_at", "updated_at", "approved_at", "used_at", "revoked_at"):
            if field in normalized and isinstance(normalized[field], str):
                normalized[field] = datetime.now(timezone.utc)
        return normalized

    async def _record_status_history(
        self,
        invitation_id: int,
        from_status: Optional[str],
        to_status: str,
        changed_by: Optional[str],
        reason: Optional[str] = None,
        endpoint: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> None:
        self.db.add(
            Invitation_status_history(
                invitation_id=invitation_id,
                from_status=from_status,
                to_status=to_status,
                changed_by=(changed_by or "system"),
                changed_at=self._now(),
                reason=reason,
                endpoint=endpoint,
                request_id=request_id,
            )
        )

    async def create(
        self,
        data: Dict[str, Any],
        user_id: Optional[str] = None,
        *,
        changed_by: Optional[str] = None,
        reason: Optional[str] = "created",
        endpoint: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> Optional[Invitations]:
        """Create a new invitation."""
        try:
            payload = self._normalize_datetime_fields(data)
            if user_id:
                payload["user_id"] = user_id

            if not payload.get("status"):
                payload["status"] = "GENERADO"
            if payload["status"] not in self.ALLOWED_TRANSITIONS:
                raise HTTPException(status_code=400, detail=f"Invalid invitation status: {payload['status']}")
            if not payload.get("created_at"):
                payload["created_at"] = self._now()
            payload["updated_at"] = payload.get("updated_at") or self._now()

            obj = Invitations(**payload)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            await self._record_status_history(
                invitation_id=obj.id,
                from_status=None,
                to_status=obj.status,
                changed_by=changed_by or user_id or obj.user_id,
                reason=reason,
                endpoint=endpoint,
                request_id=request_id,
            )
            await self.db.commit()
            logger.info("Created invitations with id: %s", obj.id)
            return obj
        except Exception:
            await self.db.rollback()
            logger.exception("Error creating invitations")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            return obj is not None
        except Exception:
            logger.exception("Error checking ownership for invitations %s", obj_id)
            return False

    async def get(self, invitation_id: int) -> Optional[Invitations]:
        try:
            result = await self.db.execute(select(Invitations).where(Invitations.id == invitation_id))
            return result.scalar_one_or_none()
        except Exception:
            logger.exception("Error fetching invitation %s", invitation_id)
            raise

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Invitations]:
        try:
            query = select(Invitations).where(Invitations.id == obj_id)
            if user_id:
                query = query.where(Invitations.user_id == user_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception:
            logger.exception("Error fetching invitations %s", obj_id)
            raise

    async def get_all(self) -> list[Invitations]:
        try:
            result = await self.db.execute(select(Invitations))
            return result.scalars().all()
        except Exception:
            logger.exception("Error fetching all invitations")
            raise

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 20,
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            query = select(Invitations)
            count_query = select(func.count(Invitations.id))

            if user_id:
                query = query.where(Invitations.user_id == user_id)
                count_query = count_query.where(Invitations.user_id == user_id)

            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Invitations, field):
                        query = query.where(getattr(Invitations, field) == value)
                        count_query = count_query.where(getattr(Invitations, field) == value)

            total = (await self.db.execute(count_query)).scalar()

            if sort:
                if sort.startswith("-"):
                    field_name = sort[1:]
                    if hasattr(Invitations, field_name):
                        query = query.order_by(getattr(Invitations, field_name).desc())
                elif hasattr(Invitations, sort):
                    query = query.order_by(getattr(Invitations, sort))
            else:
                query = query.order_by(Invitations.id.desc())

            items = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
            return {"items": items, "total": total, "skip": skip, "limit": limit}
        except Exception:
            logger.exception("Error fetching invitations list")
            raise

    def _validate_generic_mutability(self, obj: Invitations, update_data: Dict[str, Any]) -> None:
        attempted = set(update_data.keys())
        forbidden = attempted & self.GENERIC_PROTECTED_FIELDS
        if forbidden:
            blocked = ", ".join(sorted(forbidden))
            raise HTTPException(status_code=400, detail=f"Protected fields cannot be updated directly: {blocked}")

        for field in self.ALWAYS_IMMUTABLE_FIELDS:
            if field in update_data:
                raise HTTPException(status_code=400, detail=f"Field '{field}' is immutable")

        if obj.status != "GENERADO":
            for field in self.IMMUTABLE_AFTER_GENERATED_FIELDS:
                if field in update_data:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Field '{field}' is immutable after generation",
                    )

    async def update(self, obj_id: int, update_data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Invitations]:
        """Generic update for non-status fields."""
        try:
            payload = self._normalize_datetime_fields(update_data)
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning("Invitations %s not found for update", obj_id)
                return None

            self._validate_generic_mutability(obj, payload)

            for key, value in payload.items():
                if hasattr(obj, key) and key != "user_id":
                    setattr(obj, key, value)
            obj.updated_at = self._now()

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info("Updated invitations %s", obj_id)
            return obj
        except HTTPException:
            raise
        except Exception:
            await self.db.rollback()
            logger.exception("Error updating invitations %s", obj_id)
            raise

    def _validate_transition(self, current_status: str, new_status: str) -> None:
        allowed = self.ALLOWED_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            raise HTTPException(
                status_code=409,
                detail=f"Invalid status transition: {current_status} -> {new_status}",
            )

    async def transition_status(
        self,
        obj_id: int,
        new_status: str,
        *,
        changed_by: Optional[str],
        user_id: Optional[str] = None,
        reason: Optional[str] = None,
        endpoint: Optional[str] = None,
        request_id: Optional[str] = None,
        extra_updates: Optional[Dict[str, Any]] = None,
    ) -> Invitations:
        obj = await self.get_by_id(obj_id, user_id=user_id)
        if not obj:
            raise HTTPException(status_code=404, detail="Invitations not found")

        if obj.status == new_status:
            return obj

        self._validate_transition(obj.status, new_status)
        from_status = obj.status
        now = self._now()
        updates = dict(extra_updates or {})
        updates["status"] = new_status
        updates["updated_at"] = now

        if new_status == "APROBADO":
            updates.setdefault("approved_at", now)
            updates.setdefault("approved_by", changed_by)
            updates.setdefault("rejection_reason", None)
        elif new_status == "RECHAZADO":
            updates.setdefault("approved_by", changed_by)
        elif new_status == "USADO":
            updates.setdefault("used_at", now)
        elif new_status == "REVOCADO":
            updates.setdefault("revoked_at", now)
            updates.setdefault("revoked_by", changed_by)

        for key, value in updates.items():
            if hasattr(obj, key) and key != "user_id":
                setattr(obj, key, value)

        await self._record_status_history(
            invitation_id=obj.id,
            from_status=from_status,
            to_status=new_status,
            changed_by=changed_by,
            reason=reason,
            endpoint=endpoint,
            request_id=request_id,
        )
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def activate_invitation(
        self,
        invitation_id: int,
        *,
        changed_by: Optional[str],
        reason: Optional[str] = None,
        endpoint: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> Invitations:
        return await self.transition_status(
            invitation_id,
            "PENDIENTE_APROBACION",
            changed_by=changed_by,
            reason=reason or "activation",
            endpoint=endpoint,
            request_id=request_id,
        )

    async def decide_approval(
        self,
        invitation_id: int,
        *,
        approved: bool,
        changed_by: Optional[str],
        rejection_reason: Optional[str] = None,
        endpoint: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> Invitations:
        new_status = "APROBADO" if approved else "RECHAZADO"
        return await self.transition_status(
            invitation_id,
            new_status,
            changed_by=changed_by,
            reason=rejection_reason if not approved else "approved",
            endpoint=endpoint,
            request_id=request_id,
            extra_updates={
                "approved_by": changed_by,
                "rejection_reason": None if approved else rejection_reason,
            },
        )

    async def mark_used(
        self,
        invitation_id: int,
        *,
        changed_by: Optional[str],
        user_id: Optional[str] = None,
        reason: Optional[str] = None,
        endpoint: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> Invitations:
        return await self.transition_status(
            invitation_id,
            "USADO",
            changed_by=changed_by,
            user_id=user_id,
            reason=reason or "checkin",
            endpoint=endpoint,
            request_id=request_id,
        )

    async def revoke_invitation(
        self,
        invitation_id: int,
        *,
        changed_by: Optional[str],
        user_id: Optional[str] = None,
        reason: Optional[str] = None,
        endpoint: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> Invitations:
        invitation = await self.get_by_id(invitation_id, user_id=user_id)
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitations not found")
        if invitation.status == "REVOCADO":
            return invitation
        return await self.transition_status(
            invitation_id,
            "REVOCADO",
            changed_by=changed_by,
            user_id=user_id,
            reason=reason or "revoked",
            endpoint=endpoint,
            request_id=request_id,
        )

    async def advance_to_status(
        self,
        invitation_id: int,
        *,
        target_status: str,
        changed_by: Optional[str],
        reason: Optional[str] = None,
        endpoint: Optional[str] = None,
        request_id: Optional[str] = None,
        rejection_reason: Optional[str] = None,
    ) -> Invitations:
        invitation = await self.get(invitation_id)
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitations not found")

        if invitation.status == target_status:
            return invitation

        if invitation.status == "GENERADO" and target_status in {"PENDIENTE_APROBACION", "APROBADO", "RECHAZADO"}:
            invitation = await self.activate_invitation(
                invitation_id,
                changed_by=changed_by,
                reason=reason or "advance_pending",
                endpoint=endpoint,
                request_id=request_id,
            )
        if invitation.status == "PENDIENTE_APROBACION" and target_status in {"APROBADO", "RECHAZADO"}:
            return await self.decide_approval(
                invitation_id,
                approved=target_status == "APROBADO",
                changed_by=changed_by,
                rejection_reason=rejection_reason,
                endpoint=endpoint,
                request_id=request_id,
            )

        if invitation.status != target_status:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot advance invitation {invitation_id} from {invitation.status} to {target_status}",
            )
        return invitation

    async def delete(
        self,
        obj_id: int,
        user_id: Optional[str] = None,
        *,
        changed_by: Optional[str] = None,
        reason: Optional[str] = None,
        endpoint: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> bool:
        """Soft-delete by revoking invitation; hard delete only with explicit non-production flag."""
        try:
            invitation = await self.get_by_id(obj_id, user_id=user_id)
            if not invitation:
                logger.warning("Invitations %s not found for deletion", obj_id)
                return False

            allow_hard_delete = (
                os.getenv("INVITATIONS_ALLOW_HARD_DELETE", "false").lower() in {"1", "true", "yes"}
                and settings.environment.lower() != "production"
            )
            if allow_hard_delete:
                await self.db.delete(invitation)
                await self.db.commit()
                logger.warning("Hard-deleted invitation %s due to INVITATIONS_ALLOW_HARD_DELETE", obj_id)
                return True

            await self.revoke_invitation(
                obj_id,
                changed_by=changed_by or user_id,
                user_id=user_id,
                reason=reason or "soft_delete",
                endpoint=endpoint,
                request_id=request_id,
            )
            return True
        except HTTPException:
            raise
        except Exception:
            await self.db.rollback()
            logger.exception("Error deleting invitations %s", obj_id)
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Invitations]:
        try:
            if not hasattr(Invitations, field_name):
                raise ValueError(f"Field {field_name} does not exist on Invitations")
            result = await self.db.execute(
                select(Invitations).where(getattr(Invitations, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception:
            logger.exception("Error fetching invitations by %s", field_name)
            raise

    async def list_by_field(self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20) -> List[Invitations]:
        try:
            if not hasattr(Invitations, field_name):
                raise ValueError(f"Field {field_name} does not exist on Invitations")
            result = await self.db.execute(
                select(Invitations)
                .where(getattr(Invitations, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Invitations.id.desc())
            )
            return result.scalars().all()
        except Exception:
            logger.exception("Error fetching invitations by %s", field_name)
            raise

    async def get_status_history(self, invitation_id: int) -> List[Invitation_status_history]:
        result = await self.db.execute(
            select(Invitation_status_history)
            .where(Invitation_status_history.invitation_id == invitation_id)
            .order_by(Invitation_status_history.changed_at.desc(), Invitation_status_history.id.desc())
        )
        return result.scalars().all()
