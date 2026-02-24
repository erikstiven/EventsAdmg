from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String, Text


class Invitations(Base):
    __tablename__ = "invitations"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    event_id = Column(Integer, nullable=False)
    attendee_id = Column(Integer, nullable=False)
    token = Column(String, nullable=False)
    token_plain = Column(String, nullable=True)
    activation_code = Column(String, nullable=True)
    status = Column(String, nullable=False)
    biometric_photo = Column(Text, nullable=True)
    rejection_reason = Column(String, nullable=True)
    approved_by = Column(String, nullable=True)
    user_id = Column(String, nullable=False)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=True)
