from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text


class Biometric_embeddings(Base):
    __tablename__ = "biometric_embeddings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    person_id = Column(Integer, ForeignKey("attendees.id"), nullable=False, index=True)
    embedding = Column(Text, nullable=False)
    model_version = Column(String(120), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    invalidated_at = Column(DateTime(timezone=True), nullable=True)
