import logging
import os
import smtplib
import re
import html
from email.message import EmailMessage
from email.utils import make_msgid
from typing import Any, Iterable, Mapping

logger = logging.getLogger(__name__)


class EmailService:
    @staticmethod
    def normalize_template_html(content: str) -> str:
        """Normalize legacy escaped HTML templates stored by rich-text editors."""
        source = (content or "").strip()
        if not source:
            return ""

        if "&lt;" not in source and "&gt;" not in source and "&amp;" not in source:
            return source

        decoded = html.unescape(source)
        # Legacy Quill values may wrap escaped tags in standalone <p> nodes.
        decoded = re.sub(
            r"<p>\s*(?:\u00a0|&nbsp;|\s)*((?:</?[a-zA-Z][^>]*>\s*)+)\s*</p>",
            r"\1",
            decoded,
            flags=re.IGNORECASE,
        )
        decoded = re.sub(
            r"<p>\s*(?:<br\s*/?>|\u00a0|&nbsp;|\s)*</p>",
            "",
            decoded,
            flags=re.IGNORECASE,
        )
        return decoded.strip()

    @staticmethod
    def _get_smtp_config() -> dict:
        return {
            "host": os.environ.get("SMTP_HOST", ""),
            "port": int(os.environ.get("SMTP_PORT", "587")),
            "user": os.environ.get("SMTP_USER", ""),
            "password": os.environ.get("SMTP_PASS", ""),
            "from": os.environ.get("SMTP_FROM", ""),
            "use_tls": os.environ.get("SMTP_USE_TLS", "true").lower() == "true",
        }

    @staticmethod
    def render_template_variables(template: str, values: Mapping[str, Any]) -> str:
        content = EmailService.normalize_template_html(template)
        for key, value in values.items():
            content = content.replace(f"{{{{{key}}}}}", "" if value is None else str(value))
        return content

    @staticmethod
    def build_email_html(content: str) -> str:
        source = (content or "").strip()
        if not source:
            return ""
        if re.search(r"<!doctype html|<html[\s>]", source, re.IGNORECASE):
            return source
        return (
            "<!doctype html>"
            "<html lang=\"es\">"
            "<head>"
            "<meta charset=\"UTF-8\" />"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />"
            "</head>"
            "<body style=\"margin:0;padding:0;background:#e9eef5;\">"
            f"{source}"
            "</body>"
            "</html>"
        )

    @staticmethod
    def render_template(template: str, values: dict) -> str:
        # Backward-compatible alias.
        return EmailService.render_template_variables(template, values)

    @staticmethod
    def _looks_like_html(content: str) -> bool:
        if not content:
            return False
        sample = content.strip()
        # Generic HTML detection: any tag like <tag ...>...</tag> or self-closing tags.
        return bool(re.search(r"<\s*[a-zA-Z][^>]*>", sample))

    @classmethod
    def send_invitation_email(
        cls,
        to_email: str,
        subject: str,
        template: str,
        values: dict,
        cc_emails: Iterable[str] | None = None,
        bcc_emails: Iterable[str] | None = None,
        inline_attachments: list[dict] | None = None,
    ) -> bool:
        config = cls._get_smtp_config()
        if not config["host"] or not config["user"] or not config["password"]:
            logger.warning("SMTP no configurado. Se omitio el envio de correo.")
            return False

        if not to_email:
            logger.warning("No se proporciono email de destino. Se omitio el envio.")
            return False

        body = cls.render_template_variables(template, values)

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = config["from"] or config["user"]
        message["To"] = to_email
        if cc_emails:
            cc_list = [email for email in cc_emails if email]
            if cc_list:
                message["Cc"] = ", ".join(cc_list)
        if bcc_emails:
            bcc_list = [email for email in bcc_emails if email]
            if bcc_list:
                message["Bcc"] = ", ".join(bcc_list)
        if cls._looks_like_html(body):
            message.set_content("Este correo contiene contenido HTML.")
            message.add_alternative(body, subtype="html")
            if inline_attachments:
                html_part = message.get_payload()[-1]
                for attachment in inline_attachments:
                    content = attachment.get("content")
                    if not content:
                        continue
                    maintype = attachment.get("maintype", "application")
                    subtype = attachment.get("subtype", "octet-stream")
                    filename = attachment.get("filename")
                    cid = attachment.get("cid") or make_msgid()
                    if not cid.startswith("<"):
                        cid = f"<{cid}>"
                    html_part.add_related(
                        content,
                        maintype=maintype,
                        subtype=subtype,
                        cid=cid,
                        filename=filename,
                    )
        else:
            message.set_content(body)

        try:
            if config["use_tls"]:
                with smtplib.SMTP(config["host"], config["port"]) as server:
                    server.starttls()
                    server.login(config["user"], config["password"])
                    server.send_message(message)
            else:
                with smtplib.SMTP_SSL(config["host"], config["port"]) as server:
                    server.login(config["user"], config["password"])
                    server.send_message(message)
            logger.info("Correo enviado correctamente.")
            return True
        except Exception as exc:
            logger.error(f"Error enviando correo: {exc}")
            return False
