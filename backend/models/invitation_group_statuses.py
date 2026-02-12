import unicodedata


INVITATION_GROUP_STATUS_CATALOG = (
    {"id": 1, "code": "PENDIENTE_COMPLETAR", "label": "Pendiente completar"},
    {"id": 2, "code": "EN_REGISTRO", "label": "En registro"},
    {"id": 3, "code": "PENDIENTE_APROBACION", "label": "Pendiente aprobación"},
    {"id": 4, "code": "PENDIENTE_ACTUALIZACION", "label": "Pendiente de actualización"},
    {"id": 5, "code": "APROBADO_PARCIAL", "label": "Aprobado parcial"},
    {"id": 6, "code": "APROBADO", "label": "Aprobado"},
    {"id": 7, "code": "RECHAZADO", "label": "Rechazado"},
)

INVITATION_GROUP_ALLOWED_STATUSES = tuple(item["label"] for item in INVITATION_GROUP_STATUS_CATALOG)
INVITATION_GROUP_ALLOWED_STATUS_CODES = tuple(item["code"] for item in INVITATION_GROUP_STATUS_CATALOG)

_LABEL_BY_ID = {item["id"]: item["label"] for item in INVITATION_GROUP_STATUS_CATALOG}
_ID_BY_LABEL = {item["label"]: item["id"] for item in INVITATION_GROUP_STATUS_CATALOG}
_ID_BY_CODE = {item["code"]: item["id"] for item in INVITATION_GROUP_STATUS_CATALOG}
_CODE_BY_ID = {item["id"]: item["code"] for item in INVITATION_GROUP_STATUS_CATALOG}

_STATUS_BY_NORMALIZED = {
    "pendiente completar": "Pendiente completar",
    "pendiente_completar": "Pendiente completar",
    "en registro": "En registro",
    "en_registro": "En registro",
    "en proceso": "En registro",
    "pendiente aprobacion": "Pendiente aprobación",
    "pendiente_aprobacion": "Pendiente aprobación",
    "pendiente de actualizacion": "Pendiente de actualización",
    "pendiente_de_actualizacion": "Pendiente de actualización",
    "pendiente actualizacion": "Pendiente de actualización",
    "pendiente de acutalizacion": "Pendiente de actualización",
    "pendiente_de_acutalizacion": "Pendiente de actualización",
    "aprobado parcial": "Aprobado parcial",
    "aprobado_parcial": "Aprobado parcial",
    "aprobado": "Aprobado",
    "completado": "Aprobado",
    "rechazado": "Rechazado",
}


def _normalize_raw_status(value: str) -> str:
    clean = " ".join((value or "").strip().replace("_", " ").split()).lower()
    clean = "".join(
        c for c in unicodedata.normalize("NFD", clean) if unicodedata.category(c) != "Mn"
    )
    return clean


def normalize_invitation_group_status(
    value: str | None, default: str = "Pendiente completar"
) -> str:
    if not value:
        return default
    normalized = _normalize_raw_status(value)
    mapped = _STATUS_BY_NORMALIZED.get(normalized)
    if not mapped:
        raise ValueError(f"Estado de invitación inválido: {value}")
    return mapped


def invitation_group_status_id_from_label(
    value: str | None, default: str = "Pendiente completar"
) -> int:
    label = normalize_invitation_group_status(value, default=default)
    return _ID_BY_LABEL[label]


def invitation_group_status_id_from_code(code: str) -> int:
    code_norm = (code or "").strip().upper()
    if code_norm not in _ID_BY_CODE:
        raise ValueError(f"Codigo de estado invalido: {code}")
    return _ID_BY_CODE[code_norm]


def invitation_group_status_label_from_id(
    status_id: int | None, default: str = "Pendiente completar"
) -> str:
    if status_id is None:
        return default
    return _LABEL_BY_ID.get(status_id, default)


def invitation_group_status_code_from_id(status_id: int | None, default: str = "PENDIENTE_COMPLETAR") -> str:
    if status_id is None:
        return default
    return _CODE_BY_ID.get(status_id, default)

