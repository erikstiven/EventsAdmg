import logging
import os
import smtplib
from email.message import EmailMessage
from email.utils import make_msgid
from typing import Iterable

logger = logging.getLogger(__name__)


class EmailService:
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
    def _render_template(template: str, values: dict) -> str:
        content = template
        for key, value in values.items():
            content = content.replace(f"{{{{{key}}}}}", value or "")
        return content.replace("\\n", "\n")

    @staticmethod
    def _looks_like_html(content: str) -> bool:
        if not content:
            return False
        sample = content.lower()
        return "<html" in sample or "<body" in sample or "<div" in sample or "<p" in sample or "<br" in sample

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

        body = cls._render_template(template, values)

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
