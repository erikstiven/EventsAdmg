from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Checkins(Base):
    __tablename__ = "checkins"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    invitation_id = Column(Integer, nullable=False)
    event_id = Column(Integer, nullable=False)
    attendee_id = Column(Integer, nullable=True)
    invitation_group_person_id = Column(Integer, nullable=True)
    participant_role = Column(String, nullable=True)
    staff_user_id = Column(String, nullable=False)
    gate = Column(String, nullable=True)
    biometric_validated = Column(Boolean, nullable=True)
    validation_method = Column(String, nullable=True)
    validation_notes = Column(String, nullable=True)
    qr_token_used = Column(String, nullable=True)
    checked_in_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
