from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String


class Events(Base):
    __tablename__ = "events"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    location = Column(String, nullable=True)
    event_date = Column(DateTime(timezone=True), nullable=False)
    start_time = Column(String, nullable=True)
    end_time = Column(String, nullable=True)
    status = Column(String, nullable=False)
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=True)