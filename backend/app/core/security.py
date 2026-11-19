from datetime import datetime,timedelta,timezone
from jose import jwt,JWTError
import bcrypt,secrets,hashlib
from app.core.config import settings

def hash_password(password): return bcrypt.hashpw(password.encode(),bcrypt.gensalt()).decode()
def verify_password(password,password_hash): return bcrypt.checkpw(password.encode(),password_hash.encode())
def create_token(subject,role,token_type,delta):
    now=datetime.now(timezone.utc); return jwt.encode({"sub":subject,"role":role,"type":token_type,"iat":now,"exp":now+delta},settings.JWT_SECRET,algorithm=settings.JWT_ALGORITHM)
def create_access_token(subject,role): return create_token(subject,role,"access",timedelta(minutes=settings.ACCESS_TOKEN_MINUTES))
def create_refresh_token(subject,role): return create_token(subject,role,"refresh",timedelta(days=settings.REFRESH_TOKEN_DAYS))
def decode_token(token):
    try: return jwt.decode(token,settings.JWT_SECRET,algorithms=[settings.JWT_ALGORITHM])
    except JWTError: return None
def generate_otp(): return f"{secrets.randbelow(1000000):06d}"
def hash_otp(otp): return hashlib.sha256(otp.encode()).hexdigest()
def verify_otp_hash(otp,otp_hash): return secrets.compare_digest(hash_otp(otp),otp_hash)
