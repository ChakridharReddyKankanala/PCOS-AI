import smtplib
from email.message import EmailMessage
from app.core.config import settings

def send_otp_email(to_email: str, otp: str, purpose: str):
    """
    Sends an OTP code via SMTP if configured, or prints to log for dev mode.
    Supports both Port 465 (SSL) and Port 587 (STARTTLS) with timeout safety.
    """
    print(f"[OTP DISPATCH] Dispatching OTP for {purpose} to {to_email}: OTP={otp}")
    
    smtp_host = (settings.SMTP_HOST or "").strip()
    if not smtp_host:
        print(f"[DEV EMAIL (No SMTP)] To: {to_email} | Purpose: {purpose} | OTP: {otp}")
        return

    try:
        port = int(settings.SMTP_PORT or 587)
        username = (settings.SMTP_USERNAME or "").strip()
        password = (settings.SMTP_PASSWORD or "").strip()
        from_email = (settings.SMTP_FROM or "").strip() or username

        msg = EmailMessage()
        msg["Subject"] = f"PCOS-XAI Verification Code ({purpose.capitalize()})"
        msg["From"] = from_email
        msg["To"] = to_email.strip()
        msg.set_content(
            f"Hello,\n\n"
            f"Your PCOS-XAI verification code for {purpose} is: {otp}\n\n"
            f"This code is valid for {settings.OTP_EXPIRE_MINUTES} minutes.\n"
            f"If you did not request this verification code, please ignore this email.\n\n"
            f"— PCOS-XAI Team"
        )

        if port == 465:
            with smtplib.SMTP_SSL(smtp_host, port, timeout=15) as s:
                if username and password:
                    s.login(username, password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, port, timeout=15) as s:
                try:
                    s.starttls()
                except Exception:
                    pass
                if username and password:
                    s.login(username, password)
                s.send_message(msg)

        print(f"[SMTP SUCCESS] OTP email successfully sent to {to_email}")
    except Exception as error:
        print(f"[OTP EMAIL ERROR] Failed to send email to {to_email} via SMTP ({settings.SMTP_HOST}:{settings.SMTP_PORT}): {error}")
