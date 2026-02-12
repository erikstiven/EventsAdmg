import base64
import io
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import Request
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.attendees import Attendees
from models.biometric_attempts import Biometric_attempts
from models.biometric_embeddings import Biometric_embeddings
from models.security_audit_logs import Security_audit_logs

logger = logging.getLogger(__name__)


class FacialBiometricsService:
    """
    Controlled facial biometrics integration for shadow mode:
    - Register embedding if a valid face is available.
    - Compare 1:1 against the active embedding when present.
    - Record attempts for observability, without blocking by default.
    """

    _face_app = None
    _face_app_error = None
    _np_module = None
    _np_error = None

    def __init__(self, db: AsyncSession):
        self.db = db
        self.model_name = os.environ.get("BIOMETRIC_MODEL_NAME", "buffalo_l")
        self.model_version = os.environ.get("BIOMETRIC_MODEL_VERSION", f"insightface-{self.model_name}")
        self.match_threshold = float(os.environ.get("BIOMETRIC_MATCH_THRESHOLD", "0.35"))
        self.enforcement_enabled = os.environ.get("BIOMETRIC_ENFORCEMENT", "false").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }

    @classmethod
    def _get_np(cls):
        if cls._np_module is not None:
            return cls._np_module
        if cls._np_error is not None:
            return None
        try:
            import numpy as np  # type: ignore

            cls._np_module = np
            return cls._np_module
        except Exception as exc:
            cls._np_error = str(exc)
            logger.warning("Numpy unavailable, facial embedding will stay in no-op shadow mode: %s", exc)
            return None

    @classmethod
    def _get_face_app(cls):
        if cls._face_app is not None:
            return cls._face_app
        if cls._face_app_error is not None:
            return None
        try:
            from insightface.app import FaceAnalysis

            app = FaceAnalysis(name=os.environ.get("BIOMETRIC_MODEL_NAME", "buffalo_l"))
            app.prepare(ctx_id=-1, det_size=(640, 640))
            cls._face_app = app
            logger.info("Facial model initialized successfully (%s)", os.environ.get("BIOMETRIC_MODEL_NAME", "buffalo_l"))
            return cls._face_app
        except Exception as exc:
            cls._face_app_error = str(exc)
            logger.warning("Facial model unavailable, shadow mode will keep recording without embeddings: %s", exc)
            return None

    async def _audit(
        self,
        event_type: str,
        details: dict[str, Any],
        actor_user_id: Optional[str] = None,
        request: Optional[Request] = None,
        endpoint: Optional[str] = None,
        method: Optional[str] = None,
        target_type: str = "BIOMETRIC",
        target_id: Optional[str] = None,
    ) -> None:
        try:
            self.db.add(
                Security_audit_logs(
                    actor_user_id=actor_user_id,
                    event_type=event_type,
                    target_type=target_type,
                    target_id=target_id,
                    endpoint=endpoint or (request.url.path if request else None),
                    method=method or (request.method if request else None),
                    details_json=json.dumps(details, ensure_ascii=False),
                    ip_address=request.client.host if request and request.client else None,
                    user_agent=request.headers.get("user-agent") if request else None,
                )
            )
        except Exception:
            # Never fail core flow because of audit logging
            pass

    @staticmethod
    def _decode_data_uri(data_uri: str) -> bytes:
        if not data_uri:
            return b""
        raw = data_uri
        if "," in data_uri:
            _, raw = data_uri.split(",", 1)
        return base64.b64decode(raw)

    async def _load_image_bytes(self, image_input: str) -> bytes:
        if not image_input:
            return b""
        value = image_input.strip()
        if not value:
            return b""
        if value.startswith("data:image"):
            return self._decode_data_uri(value)
        if value.startswith("http://") or value.startswith("https://"):
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(value)
                response.raise_for_status()
                return response.content
        if value.startswith("/uploads/"):
            local_path = Path(value.lstrip("/"))
            if local_path.exists():
                return local_path.read_bytes()
        if value.startswith("/api/v1/invitation-groups/public/files/"):
            filename = value.rsplit("/", 1)[-1]
            local_path = Path("uploads") / "invitation_groups" / filename
            if local_path.exists():
                return local_path.read_bytes()
        local_file = Path(value)
        if local_file.exists():
            return local_file.read_bytes()
        return b""

    @staticmethod
    def _extract_embedding_from_bytes(image_bytes: bytes) -> Optional[Any]:
        if not image_bytes:
            return None
        np = FacialBiometricsService._get_np()
        if np is None:
            return None
        app = FacialBiometricsService._get_face_app()
        if app is None:
            return None
        pil_image = None
        try:
            # Load image via Pillow and convert to BGR ndarray expected by InsightFace.
            pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            np_image = np.asarray(pil_image)
            bgr_image = np_image[:, :, ::-1]
            faces = app.get(bgr_image)
            if not faces:
                return None
            target = max(
                faces,
                key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
            )
            embedding = getattr(target, "normed_embedding", None)
            if embedding is None:
                embedding = getattr(target, "embedding", None)
            if embedding is None:
                return None
            emb = np.array(embedding, dtype=np.float32)
            norm = float(np.linalg.norm(emb))
            if norm > 0:
                emb = emb / norm
            return emb
        except Exception:
            return None
        finally:
            if pil_image is not None:
                try:
                    pil_image.close()
                except Exception:
                    pass

    async def extract_embedding(self, image_input: str) -> Optional[list[float]]:
        try:
            image_bytes = await self._load_image_bytes(image_input)
            if not image_bytes:
                return None
            # Lightweight CPU operation; keep in-process to avoid extra complexity.
            embedding = self._extract_embedding_from_bytes(image_bytes)
            if embedding is None:
                return None
            return embedding.astype(float).tolist()
        except Exception as exc:
            logger.warning("Failed to extract embedding: %s", exc)
            return None

    async def resolve_person_id_by_identification(self, identification: Optional[str]) -> Optional[int]:
        if not identification:
            return None
        normalized = identification.strip()
        if not normalized:
            return None
        result = await self.db.execute(
            select(Attendees)
            .where(Attendees.identification == normalized)
            .order_by(Attendees.id.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        return row.id if row else None

    async def upsert_active_embedding(
        self,
        person_id: int,
        embedding: list[float],
        actor_user_id: Optional[str] = None,
        request: Optional[Request] = None,
        source: str = "unknown",
    ) -> Optional[Biometric_embeddings]:
        if not person_id or not embedding:
            return None
        now = datetime.now(timezone.utc)
        try:
            result = await self.db.execute(
                select(Biometric_embeddings).where(
                    Biometric_embeddings.person_id == person_id,
                    Biometric_embeddings.is_active.is_(True),
                )
            )
            active_rows = result.scalars().all()
            for row in active_rows:
                row.is_active = False
                row.invalidated_at = now
            new_row = Biometric_embeddings(
                person_id=person_id,
                embedding=json.dumps(embedding),
                model_version=self.model_version,
                is_active=True,
                created_at=now,
            )
            self.db.add(new_row)
            await self._audit(
                event_type="BIOMETRIC_EMBEDDING_UPSERT",
                actor_user_id=actor_user_id,
                request=request,
                target_id=str(person_id),
                details={
                    "person_id": person_id,
                    "model_version": self.model_version,
                    "source": source,
                    "active_invalidated": len(active_rows),
                },
            )
            await self.db.commit()
            await self.db.refresh(new_row)
            return new_row
        except Exception as exc:
            await self.db.rollback()
            logger.warning("Failed to upsert embedding for person_id=%s: %s", person_id, exc)
            return None

    async def register_embedding_for_person(
        self,
        person_id: int,
        image_input: str,
        actor_user_id: Optional[str] = None,
        request: Optional[Request] = None,
        source: str = "unknown",
    ) -> Optional[Biometric_embeddings]:
        embedding = await self.extract_embedding(image_input)
        if not embedding:
            await self._audit(
                event_type="BIOMETRIC_EMBEDDING_SKIPPED",
                actor_user_id=actor_user_id,
                request=request,
                target_id=str(person_id),
                details={
                    "person_id": person_id,
                    "model_version": self.model_version,
                    "source": source,
                    "reason": "NO_FACE_OR_MODEL",
                },
            )
            try:
                await self.db.commit()
            except Exception:
                await self.db.rollback()
            return None
        return await self.upsert_active_embedding(
            person_id=person_id,
            embedding=embedding,
            actor_user_id=actor_user_id,
            request=request,
            source=source,
        )

    async def _get_active_embedding_vector(self, person_id: int) -> Optional[Any]:
        np = self._get_np()
        if np is None:
            return None
        result = await self.db.execute(
            select(Biometric_embeddings)
            .where(
                Biometric_embeddings.person_id == person_id,
                Biometric_embeddings.is_active.is_(True),
            )
            .order_by(Biometric_embeddings.created_at.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if not row:
            return None
        try:
            vec = np.array(json.loads(row.embedding), dtype=np.float32)
            norm = float(np.linalg.norm(vec))
            if norm > 0:
                vec = vec / norm
            return vec
        except Exception:
            return None

    async def record_attempt(
        self,
        person_id: int,
        match_score: Optional[float],
        result: str,
        device_info: Optional[str] = None,
        actor_user_id: Optional[str] = None,
        request: Optional[Request] = None,
    ) -> Optional[Biometric_attempts]:
        now = datetime.now(timezone.utc)
        try:
            row = Biometric_attempts(
                person_id=person_id,
                match_score=match_score,
                result=result,
                model_version=self.model_version,
                device_info=device_info,
                created_at=now,
            )
            self.db.add(row)
            await self._audit(
                event_type="BIOMETRIC_ATTEMPT_RECORDED",
                actor_user_id=actor_user_id,
                request=request,
                target_id=str(person_id),
                details={
                    "person_id": person_id,
                    "result": result,
                    "match_score": match_score,
                    "model_version": self.model_version,
                    "enforcement_enabled": self.enforcement_enabled,
                },
            )
            await self.db.commit()
            await self.db.refresh(row)
            return row
        except Exception as exc:
            await self.db.rollback()
            logger.warning("Failed to record biometric attempt for person_id=%s: %s", person_id, exc)
            return None

    async def compare_1to1_shadow(
        self,
        person_id: int,
        captured_image_input: str,
        device_info: Optional[str] = None,
        actor_user_id: Optional[str] = None,
        request: Optional[Request] = None,
    ) -> dict[str, Any]:
        """
        Compare captured face against active embedding (if exists) and record attempt.
        Returns MATCH/NO_MATCH/NO_EMBEDDING without raising to keep check-in resilient.
        """
        active_vec = await self._get_active_embedding_vector(person_id)
        if active_vec is None:
            await self.record_attempt(
                person_id=person_id,
                match_score=None,
                result="NO_EMBEDDING",
                device_info=device_info,
                actor_user_id=actor_user_id,
                request=request,
            )
            return {
                "result": "NO_EMBEDDING",
                "score": None,
                "enforcement": self.enforcement_enabled,
                "threshold": self.match_threshold,
            }

        captured_embedding = await self.extract_embedding(captured_image_input)
        if not captured_embedding:
            await self.record_attempt(
                person_id=person_id,
                match_score=None,
                result="NO_MATCH",
                device_info=device_info,
                actor_user_id=actor_user_id,
                request=request,
            )
            return {
                "result": "NO_MATCH",
                "score": None,
                "enforcement": self.enforcement_enabled,
                "threshold": self.match_threshold,
            }

        np = self._get_np()
        if np is None:
            await self.record_attempt(
                person_id=person_id,
                match_score=None,
                result="NO_EMBEDDING",
                device_info=device_info,
                actor_user_id=actor_user_id,
                request=request,
            )
            return {
                "result": "NO_EMBEDDING",
                "score": None,
                "enforcement": self.enforcement_enabled,
                "threshold": self.match_threshold,
            }

        captured_vec = np.array(captured_embedding, dtype=np.float32)
        norm = float(np.linalg.norm(captured_vec))
        if norm > 0:
            captured_vec = captured_vec / norm

        score = float(np.dot(captured_vec, active_vec))
        result = "MATCH" if score >= self.match_threshold else "NO_MATCH"

        await self.record_attempt(
            person_id=person_id,
            match_score=score,
            result=result,
            device_info=device_info,
            actor_user_id=actor_user_id,
            request=request,
        )
        return {
            "result": result,
            "score": score,
            "enforcement": self.enforcement_enabled,
            "threshold": self.match_threshold,
        }
