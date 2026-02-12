from core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text


class Invitation_group_status_history(Base):
    __tablename__ = "invitation_group_status_history"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    invitation_group_id = Column(
        Integer,
        ForeignKey("invitation_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_status_id = Column(
        Integer,
        ForeignKey("invitation_group_status_catalog.id"),
        nullable=True,
    )
    to_status_id = Column(
        Integer,
        ForeignKey("invitation_group_status_catalog.id"),
        nullable=False,
    )
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=True)
    changed_by = Column(String, nullable=False)
    reason = Column(Text, nullable=True)
    payload = Column(Text, nullable=True)
    changed_at = Column(DateTime(timezone=True), nullable=False)
