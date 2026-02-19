import json
import math
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from dependencies.permissions import require_any_permission
from models.biometric_embeddings import Biometric_embeddings
from services.facial_biometrics import FacialBiometricsService
from schemas.auth import UserResponse

router = APIRouter(prefix="/biometria", tags=["biometria"])


class BiometriaRequest(BaseModel):
    invitadoId: int
    embedding: List[float]
    captured_image_base64: str | None = None


class BiometriaResponse(BaseModel):
    aprobado: bool
    similitud: float


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for x, y in zip(a, b):
        dot += x * y
        norm_a += x * x
        norm_b += y * y
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


@router.post("/verificar", response_model=BiometriaResponse)
async def verificar_biometria(
    data: BiometriaRequest,
    _user: UserResponse = Depends(get_current_user),
    _perm: UserResponse = Depends(require_any_permission("checkin.biometric")),
    db: AsyncSession = Depends(get_db),
):
    if not data.invitadoId or not data.embedding:
        raise HTTPException(status_code=400, detail="Datos incompletos")

    result = await db.execute(
        select(Biometric_embeddings)
        .where(
            Biometric_embeddings.person_id == data.invitadoId,
            Biometric_embeddings.is_active.is_(True),
        )
        .order_by(Biometric_embeddings.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if not row:
        return BiometriaResponse(aprobado=False, similitud=0.0)

    try:
        stored_embedding = json.loads(row.embedding)
    except Exception:
        raise HTTPException(status_code=500, detail="Embedding almacenado inválido")

    candidate_embedding = data.embedding
    if len(stored_embedding) != len(data.embedding) and data.captured_image_base64:
        facial_service = FacialBiometricsService(db)
        extracted = await facial_service.extract_embedding(data.captured_image_base64)
        if extracted:
            candidate_embedding = extracted

    similarity = cosine_similarity(stored_embedding, candidate_embedding)
    threshold = FacialBiometricsService(db).match_threshold
    approved = similarity >= threshold
    return BiometriaResponse(aprobado=approved, similitud=round(similarity, 4))
