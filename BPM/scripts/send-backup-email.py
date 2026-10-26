#!/usr/bin/env python3
"""
Send BPM database backup via SMTP (Office365).
Wraps the .sql.gz as a .zip attachment for better M365 deliverability.
Loads secrets from scripts/backup-email.env (same directory as this file).
"""
from __future__ import annotations

import io
import os
import smtplib
import ssl
import sys
import zipfile
from datetime import datetime, timezone
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid
from pathlib import Path


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def build_zip_attachment(backup_gz: Path) -> tuple[str, bytes]:
    """Return (zip_filename, zip_bytes) containing the SQL dump."""
    inner_name = backup_gz.name
    if inner_name.endswith(".sql.gz"):
        inner_name = inner_name[: -len(".gz")]
    zip_name = backup_gz.name.replace(".sql.gz", ".zip")
    if not zip_name.endswith(".zip"):
        zip_name = f"{backup_gz.stem}.zip"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.writestr(inner_name, backup_gz.read_bytes())
    return zip_name, buf.getvalue()


def main() -> int:
    scripts_dir = Path(__file__).resolve().parent
    load_env_file(scripts_dir / "backup-email.env")

    if len(sys.argv) < 2:
        print("Usage: send-backup-email.py <path-to-backup.sql.gz>", file=sys.stderr)
        return 2

    attachment = Path(sys.argv[1]).resolve()
    if not attachment.is_file():
        print(f"Backup file not found: {attachment}", file=sys.stderr)
        return 1

    host = os.environ.get("SMTP_HOST", "").strip()
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "").strip()
    from_addr = os.environ.get("SMTP_FROM", user).strip()

    raw_to = os.environ.get("BACKUP_EMAIL_TO", "")
    recipients = [e.strip() for e in raw_to.split(",") if e.strip()]
    bcc = os.environ.get("BACKUP_EMAIL_BCC", from_addr).strip()
    bcc_list = [e.strip() for e in bcc.split(",") if e.strip() and e.strip() not in recipients]

    if not host or not from_addr or not recipients:
        print(
            "SMTP not configured: set SMTP_HOST, SMTP_FROM, BACKUP_EMAIL_TO in scripts/backup-email.env",
            file=sys.stderr,
        )
        return 1

    now = datetime.now()
    now_utc = datetime.now(timezone.utc)
    subject_date = now.strftime("%Y-%m-%d_%H%M")
    subject = f"BPM Database Backup {subject_date}"

    zip_name, zip_bytes = build_zip_attachment(attachment)
    zip_size_kb = len(zip_bytes) / 1024

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = ", ".join(recipients)
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=from_addr.split("@")[-1] if "@" in from_addr else None)
    msg["X-Mailer"] = "BPM-Backup"
    msg["X-Priority"] = "3"

    text_body = (
        "BPM database backup (automated).\n\n"
        f"Attachment: {zip_name} ({zip_size_kb:.0f} KB)\n"
        f"Server time: {now.isoformat(timespec='seconds')}\n"
        f"Recipients: {', '.join(recipients)}\n\n"
        "If you do not see this email in Inbox, check:\n"
        "  - Junk / Spam folder\n"
        "  - Microsoft 365 Quarantine (security.microsoft.com/quarantine)\n"
        "  - Ask IT to message-trace from the SMTP_FROM address\n"
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #1f2937;">
        <h3 style="margin: 0 0 12px;">BPM Database Backup</h3>
        <p style="margin: 0 0 8px;">Automated PostgreSQL backup attached as a ZIP file.</p>
        <table cellpadding="6" cellspacing="0" border="0" style="border-collapse: collapse;">
          <tr><td><strong>Attachment</strong></td><td>{zip_name} ({zip_size_kb:.0f} KB)</td></tr>
          <tr><td><strong>Server time</strong></td><td>{now.isoformat(timespec='seconds')}</td></tr>
          <tr><td><strong>Recipients</strong></td><td>{", ".join(recipients)}</td></tr>
        </table>
        <p style="margin: 16px 0 0; font-size: 13px; color: #6b7280;">
          Not in Inbox? Check Junk/Spam and Microsoft 365 Quarantine, or ask IT for a message trace from
          <strong>{from_addr}</strong>.
        </p>
      </body>
    </html>
    """.strip()
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    part = MIMEBase("application", "zip")
    part.set_payload(zip_bytes)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", f'attachment; filename="{zip_name}"')
    msg.attach(part)

    all_recipients = recipients + bcc_list
    context = ssl.create_default_context()
    try:
        with smtplib.SMTP(host, port, timeout=120) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            if user and password:
                server.login(user, password)
            refused = server.sendmail(from_addr, all_recipients, msg.as_string())
    except smtplib.SMTPAuthenticationError as err:
        print(f"SMTP authentication failed for {user}: {err}", file=sys.stderr)
        return 1
    except smtplib.SMTPException as err:
        print(f"SMTP error: {err}", file=sys.stderr)
        return 1

    if refused:
        print(f"Some recipients were refused: {refused}", file=sys.stderr)
        return 1

    msg_id = msg.get("Message-ID", "")
    print(
        f"Email sent to {len(recipients)} recipient(s), "
        f"attachment={zip_name} ({zip_size_kb:.0f} KB), "
        f"subject={subject}, messageId={msg_id}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
