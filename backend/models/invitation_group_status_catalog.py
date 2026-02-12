from core.database import Base
from sqlalchemy import Column, Integer, String


class Invitation_group_status_catalog(Base):
    __tablename__ = "invitation_group_status_catalog"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=False, nullable=False)
    code = Column(String, unique=True, nullable=False)
    label = Column(String, unique=True, nullable=False)
