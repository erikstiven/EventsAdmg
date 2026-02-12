from core.database import Base
from sqlalchemy import Column, DateTime, Float, Integer, String


class Biometric_validations(Base):
    __tablename__ = "biometric_validations"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    checkin_id = Column(Integer, nullable=True)
    captured_photo_url = Column(String, nullable=True)
    reference_photo_url = Column(String, nullable=True)
    match_score = Column(Float, nullable=True)
    validation_result = Column(String, nullable=False)
    ai_response = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)