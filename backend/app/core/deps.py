from fastapi import Depends,HTTPException
from fastapi.security import HTTPBearer,HTTPAuthorizationCredentials
from app.core.security import decode_token
from app.db.mongo import get_db
bearer=HTTPBearer()
async def get_current_user(credentials:HTTPAuthorizationCredentials=Depends(bearer)):
    p=decode_token(credentials.credentials)
    if not p or p.get("type")!="access": raise HTTPException(401,"Invalid or expired access token")
    user=await get_db().users.find_one({"_id":p["sub"]})
    if not user: raise HTTPException(401,"User not found")
    user["user_id"]=user["_id"]; return user
def require_roles(*roles):
    async def checker(user=Depends(get_current_user)):
        if user["role"] not in roles: raise HTTPException(403,"Insufficient permissions")
        return user
    return checker
