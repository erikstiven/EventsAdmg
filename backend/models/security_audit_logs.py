from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func


class Security_audit_logs(Base):
    __tablename__ = "security_audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    actor_user_id = Column(String, nullable=True, index=True)
    event_type = Column(String(80), nullable=False, index=True)
    target_type = Column(String(80), nullable=True)
    target_id = Column(String(120), nullable=True)
    endpoint = Column(String(255), nullable=True)
    method = Column(String(10), nullable=True)
    details_json = Column(Text, nullable=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
