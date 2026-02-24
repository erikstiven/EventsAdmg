# Models package

# Ensure all models are imported so Base metadata includes them
from models.auth import User, OIDCState  # noqa: F401
from models.events import Events  # noqa: F401
from models.attendees import Attendees  # noqa: F401
from models.invitations import Invitations  # noqa: F401
from models.invitation_status_history import Invitation_status_history  # noqa: F401
from models.checkins import Checkins  # noqa: F401
from models.biometric_validations import Biometric_validations  # noqa: F401
from models.biometric_embeddings import Biometric_embeddings  # noqa: F401
from models.biometric_attempts import Biometric_attempts  # noqa: F401
from models.invitation_groups import Invitation_groups  # noqa: F401
from models.invitation_group_status_history import Invitation_group_status_history  # noqa: F401
from models.invitation_group_people import Invitation_group_people  # noqa: F401
from models.invitation_group_status_catalog import Invitation_group_status_catalog  # noqa: F401
from models.user_roles import User_roles  # noqa: F401
from models.rbac import Role, Permission, RolePermission  # noqa: F401
from models.security_audit_logs import Security_audit_logs  # noqa: F401
