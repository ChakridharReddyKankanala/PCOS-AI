from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pymongo.errors import DuplicateKeyError
from app.db.mongo import get_db
from app.schemas.auth import *
from app.core.security import *
from app.core.config import settings
from app.services.otp_service import create_otp_challenge, verify_otp_challenge
from app.services.notification_service import send_otp_email

router = APIRouter()

@router.post("/register")
async def register(data: RegisterRequest, bg: BackgroundTasks):
    db = get_db()
    email = data.email.lower().strip()
    
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        raise HTTPException(status_code=409, detail="Email is already registered")

    phone = data.phone.strip() if data.phone and data.phone.strip() else None
    if phone:
        existing_phone = await db.users.find_one({"phone": phone})
        if existing_phone:
            raise HTTPException(status_code=409, detail="Phone number is already registered")

    uid = str(uuid4())
    now = datetime.now(timezone.utc)
    
    user_doc = {
        "_id": uid,
        "email": email,
        "password_hash": hash_password(data.password),
        "full_name": data.full_name.strip(),
        "role": data.role,
        "verified": False,
        "created_at": now,
        "updated_at": now
    }
    if phone:
        user_doc["phone"] = phone
    
    try:
        await db.users.insert_one(user_doc)
    except DuplicateKeyError as e:
        if "phone" in str(e):
            raise HTTPException(status_code=409, detail="Phone number is already registered")
        raise HTTPException(status_code=409, detail="Email is already registered")
    
    otp = await create_otp_challenge(uid, "registration")
    bg.add_task(send_otp_email, email, otp, "registration")
    
    return {
        "message": "Registration created successfully. Please verify the OTP sent to your email to continue.",
        "user_id": uid
    }


@router.post("/verify-registration")
async def verify_registration(data: VerifyOTPRequest):
    db = get_db()
    
    is_valid = await verify_otp_challenge(data.user_id, "registration", data.otp)
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP code")
        
    now = datetime.now(timezone.utc)
    r = await db.users.update_one(
        {"_id": data.user_id},
        {"$set": {"verified": True, "updated_at": now}}
    )
    
    u = await db.users.find_one({"_id": data.user_id})
    if not u:
        raise HTTPException(status_code=404, detail="User account not found")
        
    access_token = create_access_token(u["_id"], u["role"])
    refresh_token = create_refresh_token(u["_id"], u["role"])
    
    return {
        "message": "Account verified successfully",
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "role": u["role"],
        "user_id": u["_id"],
        "full_name": u.get("full_name", "")
    }


@router.post("/login")
async def login(data: LoginRequest, bg: BackgroundTasks):
    db = get_db()
    email = data.email.lower().strip()
    
    u = await db.users.find_one({"email": email})
    if not u or not verify_password(data.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email address or password")
        
    user_role = u.get("role", "patient")

    # Check if account is verified
    if not u.get("verified", False):
        otp = await create_otp_challenge(u["_id"], "registration")
        bg.add_task(send_otp_email, u["email"], otp, "registration")
        return {
            "message": "Account is not verified yet. Verification OTP code sent to your email.",
            "user_id": u["_id"],
            "requires_verification": True,
            "role": user_role
        }
        
    otp = await create_otp_challenge(u["_id"], "login")
    bg.add_task(send_otp_email, u["email"], otp, "login")
    
    return {
        "message": "Verification code sent to your email.",
        "user_id": u["_id"],
        "role": user_role
    }


@router.post("/verify-login")
async def verify_login(data: VerifyLoginOTPRequest):
    db = get_db()
    
    is_valid = await verify_otp_challenge(data.user_id, "login", data.otp)
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP code")
        
    u = await db.users.find_one({"_id": data.user_id})
    if not u:
        raise HTTPException(status_code=404, detail="User account not found")
        
    access_token = create_access_token(u["_id"], u["role"])
    refresh_token = create_refresh_token(u["_id"], u["role"])
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "role": u["role"],
        "user_id": u["_id"],
        "full_name": u.get("full_name", "")
    }


@router.post("/refresh")
async def refresh(data: RefreshRequest):
    p = decode_token(data.refresh_token)
    if not p or p.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
        
    u = await get_db().users.find_one({"_id": p["sub"]})
    if not u:
        raise HTTPException(status_code=401, detail="User account not found")
        
    return {
        "access_token": create_access_token(u["_id"], u["role"]),
        "token_type": "bearer"
    }
