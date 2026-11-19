from fastapi import APIRouter
from app.db.mongo import get_db
router=APIRouter()
@router.get("/health")
async def health(): await get_db().command("ping"); return {"status":"healthy","database":"connected"}
