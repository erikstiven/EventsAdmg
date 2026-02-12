from core.database import Base
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text


class Biometric_attempts(Base):
    __tablename__ = "biometric_attempts"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    person_id = Column(Integer, ForeignKey("attendees.id"), nullable=False, index=True)
    match_score = Column(Float, nullable=True)
    result = Column(String(32), nullable=False, index=True)
    model_version = Column(String(120), nullable=False)
    device_info = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, index=True)
