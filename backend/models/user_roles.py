from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func


class User_roles(Base):
    __tablename__ = "user_roles"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    role = Column(String, nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    assigned_by = Column(String, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    # Keep python-side default for SQLite schemas where DB default was not created.
    created_at = Column(DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False)
