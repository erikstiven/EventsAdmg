from core.database import Base
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)


class Invitation_group_people(Base):
    __tablename__ = "invitation_group_people"
    __table_args__ = (
        UniqueConstraint("invitation_group_id", "person_index", name="uq_inv_group_person_index"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    invitation_group_id = Column(
        Integer, ForeignKey("invitation_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    person_index = Column(Integer, nullable=False)
    name = Column(String, nullable=True)
    cedula = Column(String, nullable=True)
    email = Column(String, nullable=True)
    telefono = Column(String, nullable=True)
    codigo = Column(String, nullable=True)
    selfie_url = Column(String, nullable=True)
    doc_url = Column(String, nullable=True)
    approved = Column(Boolean, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    qr_token = Column(String, nullable=True)
    qr_sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=True)

