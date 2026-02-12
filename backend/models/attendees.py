from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String, Boolean


class Attendees(Base):
    __tablename__ = "attendees"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    identification = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    id_document_url = Column(String, nullable=True)
    face_photo_url = Column(String, nullable=True)
    fingerprint_code = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=True)