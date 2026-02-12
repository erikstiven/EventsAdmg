from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String, Boolean, Text, ForeignKey


class Invitation_groups(Base):
    __tablename__ = "invitation_groups"
    __table_args__ = (
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    event_id = Column(Integer, nullable=False)
    titular_name = Column(String, nullable=False)
    titular_identification = Column(String, nullable=False)
    fingerprint_code = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    group_size = Column(Integer, nullable=False)
    send_email = Column(Boolean, nullable=False, default=True)
    send_email_cc = Column(Boolean, nullable=False, default=False)
    intransferible = Column(Boolean, nullable=False, default=True)
    status_id = Column(
        Integer,
        ForeignKey("invitation_group_status_catalog.id"),
        nullable=False,
        default=1,
    )
    status = Column(String, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    token = Column(String, nullable=False)
    token_plain = Column(String, nullable=True)
    link = Column(String, nullable=True)
    companions = Column(Text, nullable=True)
    titular_selfie_url = Column(String, nullable=True)
    titular_doc_url = Column(String, nullable=True)
    titular_approved = Column(Boolean, nullable=True)
    titular_rejection_reason = Column(Text, nullable=True)
    titular_qr_token = Column(String, nullable=True)
    titular_qr_sent_at = Column(DateTime(timezone=True), nullable=True)
    email_sent_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=True)
