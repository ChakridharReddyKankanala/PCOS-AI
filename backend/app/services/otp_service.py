from datetime import datetime, timezone, timedelta
import secrets

from app.core.config import settings
from app.db import mongo


async def create_otp_challenge(user_id, purpose):
    """
    Create a new 6-digit OTP challenge.
    """

    # Generate 6-digit OTP
    otp = f"{secrets.randbelow(1000000):06d}"

    # Current UTC time
    now = datetime.now(timezone.utc)

    # OTP expiry
    expires_at = now + timedelta(
        minutes=settings.OTP_EXPIRE_MINUTES
    )

    # Remove previous OTP for this user and purpose
    await mongo.get_db().otp_challenges.delete_many({
        "user_id": user_id,
        "purpose": purpose
    })

    # Create OTP document
    challenge = {
        "user_id": user_id,
        "purpose": purpose,
        "otp": otp,
        "expires_at": expires_at,
        "attempts": 0,
        "verified": False,
        "created_at": now
    }

    await mongo.get_db().otp_challenges.insert_one(challenge)

    # Development mode
    print(
        f"[DEV OTP] user_id={user_id} "
        f"purpose={purpose} OTP={otp}"
    )

    return otp


async def verify_otp_challenge(user_id, purpose, otp):
    """
    Verify an OTP challenge.
    """

    # Find OTP
    c = await mongo.get_db().otp_challenges.find_one({
        "user_id": user_id,
        "purpose": purpose
    })

    # OTP does not exist
    if not c:
        return False

    # Get expiration datetime
    expires_at = c["expires_at"]

    # MongoDB may return a timezone-naive datetime.
    # Convert it to UTC-aware datetime.
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    # Check expiration
    if expires_at <= datetime.now(timezone.utc):
        return False

    # Check number of attempts
    attempts = c.get("attempts", 0)

    if attempts >= settings.OTP_MAX_ATTEMPTS:
        return False

    # Check OTP
    if str(c.get("otp")) != str(otp):
        await mongo.get_db().otp_challenges.update_one(
            {
                "_id": c["_id"]
            },
            {
                "$inc": {
                    "attempts": 1
                }
            }
        )

        return False

    # OTP is correct
    await mongo.get_db().otp_challenges.update_one(
        {
            "_id": c["_id"]
        },
        {
            "$set": {
                "verified": True,
                "verified_at": datetime.now(timezone.utc)
            }
        }
    )

    return True