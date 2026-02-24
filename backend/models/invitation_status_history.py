from core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text


class Invitation_status_history(Base):
    __tablename__ = "invitation_status_history"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    invitation_id = Column(
        Integer,
        ForeignKey("invitations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=False)
    changed_by = Column(String, nullable=False)
    changed_at = Column(DateTime(timezone=True), nullable=False)
    reason = Column(Text, nullable=True)
    endpoint = Column(String, nullable=True)
    request_id = Column(String, nullable=True)
