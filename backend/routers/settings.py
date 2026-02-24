from pathlib import Path
from typing import Dict

from dependencies.auth import get_admin_user
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from schemas.auth import UserResponse

router = APIRouter(prefix="/api/v1/admin/settings", tags=["admin-settings"])


class EnvVariable(BaseModel):
    key: str
    value: str
    description: str = ""


class EnvConfig(BaseModel):
    backend_vars: Dict[str, EnvVariable]
    frontend_vars: Dict[str, EnvVariable]


class EnvVariableUpdate(BaseModel):
    value: str


def validate_backend_setting(key: str, value: str) -> str:
    """Validate and normalize backend settings for known sensitive keys."""
    normalized_key = (key or "").strip().upper()
    normalized_value = (value or "").strip()

    if normalized_key == "BIOMETRIC_MATCH_THRESHOLD":
        try:
            threshold = float(normalized_value)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="BIOMETRIC_MATCH_THRESHOLD must be a number between 0 and 1.") from exc
        if threshold < 0 or threshold > 1:
            raise HTTPException(status_code=400, detail="BIOMETRIC_MATCH_THRESHOLD must be between 0 and 1.")
        return str(threshold)

    if normalized_key == "BIOMETRIC_ENFORCEMENT":
        val = normalized_value.lower()
        if val not in {"true", "false", "1", "0", "yes", "no", "on", "off"}:
            raise HTTPException(status_code=400, detail="BIOMETRIC_ENFORCEMENT must be a boolean value.")
        return "true" if val in {"true", "1", "yes", "on"} else "false"

    if normalized_key == "BIOMETRIC_MODEL_NAME":
        if not normalized_value:
            raise HTTPException(status_code=400, detail="BIOMETRIC_MODEL_NAME cannot be empty.")
        return normalized_value

    return value


def get_env_file_path(env_type: str) -> Path:
    """Get the path to the environment variable file."""
    base_path = Path(__file__).parent.parent
    if env_type == "backend":
        return base_path / ".env"
    elif env_type == "frontend":
        return base_path.parent / "frontend" / ".env"
    else:
        raise ValueError("Invalid env_type")


def read_env_file(env_type: str) -> Dict[str, str]:
    """Read an environment variable file."""
    env_file = get_env_file_path(env_type)
    if not env_file.exists():
        return {}

    env_vars = {}
    with open(env_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                raw_value = value.strip()
                if (
                    (raw_value.startswith('"') and raw_value.endswith('"'))
                    or (raw_value.startswith("'") and raw_value.endswith("'"))
                ):
                    raw_value = raw_value[1:-1]
                normalized_value = (
                    raw_value.replace('\\"', '"')
                    .replace("\\'", "'")
                    .replace("\\n", "\n")
                )
                env_vars[key.strip()] = normalized_value
    return env_vars


def write_env_file(env_type: str, env_vars: Dict[str, str]):
    """Write to an environment variable file."""
    env_file = get_env_file_path(env_type)

    # Ensure the directory exists
    env_file.parent.mkdir(parents=True, exist_ok=True)

    with open(env_file, "w", encoding="utf-8") as f:
        for key, value in env_vars.items():
            safe_value = (
                str(value)
                .replace("\\", "\\\\")
                .replace('"', '\\"')
                .replace("\r\n", "\n")
                .replace("\n", "\\n")
            )
            # Always quote to avoid dotenv truncation on '#', ';', spaces, etc.
            f.write(f'{key}="{safe_value}"\n')


@router.get("", response_model=EnvConfig)
async def get_settings(current_user: UserResponse = Depends(get_admin_user)):
    """Retrieve environment variable configuration."""
    try:
        backend_vars = read_env_file("backend")
        frontend_vars = read_env_file("frontend")

        # Define descriptions for configuration items
        backend_descriptions = {
            "DATABASE_URL": "Database connection string",
            "STRIPE_SECRET_KEY": "Stripe secret key",
            "STRIPE_SUCCESS_URL": "Payment success callback URL",
            "STRIPE_CANCEL_URL": "Payment cancellation callback URL",
            "ALLOWED_DOMAINS": "Allowed domains",
            "OIDC_ISSUER_URL": "OIDC issuer URL",
            "OIDC_CLIENT_ID": "OIDC client ID",
            "OIDC_CLIENT_SECRET": "OIDC client secret",
            "OIDC_SCOPE": "OIDC scopes",
            "HOST": "Server host address",
            "PORT": "Server port",
            "FRONTEND_URL": "Frontend URL",
            "JWT_SECRET_KEY": "JWT signing secret key",
            "JWT_ALGORITHM": "JWT signing algorithm",
            "JWT_EXPIRE_MINUTES": "JWT expiration time (minutes)",
            "ADMIN_USER_ID": "Admin user ID",
            "ADMIN_USER_EMAIL": "Admin user email",
            "SMTP_HOST": "SMTP server host",
            "SMTP_PORT": "SMTP server port",
            "SMTP_USER": "SMTP username/email",
            "SMTP_PASS": "SMTP password/app password",
            "SMTP_FROM": "Default From address",
            "SMTP_USE_TLS": "Use TLS for SMTP",
            "INVITATION_EMAIL_SUBJECT": "Email subject for invitations",
            "INVITATION_EMAIL_TEMPLATE": "Email template for invitations",
            "BIOMETRIC_MATCH_THRESHOLD": "Biometric match threshold (0..1)",
            "BIOMETRIC_ENFORCEMENT": "Enable strict biometric enforcement (true/false)",
            "BIOMETRIC_MODEL_NAME": "Facial recognition model name",
            "BIOMETRIC_MODEL_VERSION": "Facial recognition model version metadata",
        }

        frontend_descriptions = {"VITE_API_BASE_URL": "Base API URL", "VITE_FRONTEND_URL": "Frontend URL"}

        # Build response data
        backend_config = {}
        for key, value in backend_vars.items():
            backend_config[key] = EnvVariable(key=key, value=value, description=backend_descriptions.get(key, ""))

        frontend_config = {}
        for key, value in frontend_vars.items():
            frontend_config[key] = EnvVariable(key=key, value=value, description=frontend_descriptions.get(key, ""))

        return EnvConfig(backend_vars=backend_config, frontend_vars=frontend_config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read configuration: {str(e)}")


@router.put("/backend/{key}")
async def update_backend_setting(
    key: str, update: EnvVariableUpdate, current_user: UserResponse = Depends(get_admin_user)
):
    """Update a backend environment variable."""
    try:
        env_vars = read_env_file("backend")
        env_vars[key] = validate_backend_setting(key, update.value)
        write_env_file("backend", env_vars)
        return {"message": f"Backend configuration '{key}' updated successfully; restart required to take effect."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update configuration: {str(e)}")


@router.put("/frontend/{key}")
async def update_frontend_setting(
    key: str, update: EnvVariableUpdate, current_user: UserResponse = Depends(get_admin_user)
):
    """Update a frontend environment variable."""
    try:
        env_vars = read_env_file("frontend")
        env_vars[key] = update.value
        write_env_file("frontend", env_vars)
        return {"message": f"Frontend configuration '{key}' updated successfully; restart required to take effect."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update configuration: {str(e)}")


@router.post("/backend/{key}")
async def add_backend_setting(
    key: str, update: EnvVariableUpdate, current_user: UserResponse = Depends(get_admin_user)
):
    """Add a backend environment variable."""
    try:
        env_vars = read_env_file("backend")
        env_vars[key] = validate_backend_setting(key, update.value)
        write_env_file("backend", env_vars)
        return {"message": f"Backend configuration '{key}' added successfully; restart required to take effect."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add configuration: {str(e)}")


@router.post("/frontend/{key}")
async def add_frontend_setting(
    key: str, update: EnvVariableUpdate, current_user: UserResponse = Depends(get_admin_user)
):
    """Add a frontend environment variable."""
    try:
        env_vars = read_env_file("frontend")
        env_vars[key] = update.value
        write_env_file("frontend", env_vars)
        return {"message": f"Frontend configuration '{key}' added successfully; restart required to take effect."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add configuration: {str(e)}")


@router.delete("/backend/{key}")
async def delete_backend_setting(key: str, current_user: UserResponse = Depends(get_admin_user)):
    """Delete a backend environment variable."""
    try:
        env_vars = read_env_file("backend")
        if key in env_vars:
            del env_vars[key]
            write_env_file("backend", env_vars)
            return {"message": f"Backend configuration '{key}' deleted successfully; restart required to take effect."}
        else:
            raise HTTPException(status_code=404, detail=f"Configuration item '{key}' does not exist")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete configuration: {str(e)}")


@router.delete("/frontend/{key}")
async def delete_frontend_setting(key: str, current_user: UserResponse = Depends(get_admin_user)):
    """Delete a frontend environment variable."""
    try:
        env_vars = read_env_file("frontend")
        if key in env_vars:
            del env_vars[key]
            write_env_file("frontend", env_vars)
            return {"message": f"Frontend configuration '{key}' deleted successfully; restart required to take effect."}
        else:
            raise HTTPException(status_code=404, detail=f"Configuration item '{key}' does not exist")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete configuration: {str(e)}")
