from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.config import settings
from app.db.mongo import get_db
from app.api.analysis import get_optional_user
from app.core.deps import get_current_user
from app.core.doctor_access import doctor_patient_access
from app.services.llm_service import (
    chat_with_assistant,
    generate_clinical_insights,
    generate_fallback_insights,
)

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: List[ChatMessage] = Field(default_factory=list)
    analysis_id: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    model: str
    has_api_key: bool


@router.get("/status")
async def assistant_status():
    has_key = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())
    return {
        "status": "ready",
        "has_api_key": has_key,
        "model": settings.GEMINI_MODEL or "gemini-1.5-flash",
        "provider": "Google Gemini" if has_key else "Clinical Rule-Based Copilot",
    }


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, request: Request):
    user = await get_optional_user(request)
    patient_context = None

    if payload.analysis_id:
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        query = {"_id": payload.analysis_id}
        if user.get("role") != "doctor":
            query["patient_id"] = user.get("user_id")
        analysis = await get_db().analyses.find_one(query)
        if not analysis or (
            user.get("role") == "doctor"
            and not await doctor_patient_access(
                get_db(), user["user_id"], analysis.get("patient_id")
            )
        ):
            raise HTTPException(status_code=404, detail="Analysis not found")
        patient_context = {
            "combined_prediction": analysis.get("combined", {}).get("prediction"),
            "probability": analysis.get("combined", {}).get("probability"),
            "clinical_summary": analysis.get("clinical", {}),
            "ultrasound_summary": analysis.get("ultrasound", {}),
            "ai_insights": analysis.get("ai_insights"),
        }

    # Build messages list
    formatted_messages = [{"role": msg.role, "content": msg.content} for msg in payload.history]
    formatted_messages.append({"role": "user", "content": payload.message})

    reply = await chat_with_assistant(formatted_messages, patient_context=patient_context)
    has_key = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())

    return ChatResponse(
        reply=reply,
        model=settings.GEMINI_MODEL or "gemini-1.5-flash",
        has_api_key=has_key,
    )


@router.post("/insights/{analysis_id}")
async def get_or_generate_insights(
    analysis_id: str,
    user=Depends(get_current_user),
):
    query = {"_id": analysis_id}
    if user and user.get("role") != "doctor":
        query["patient_id"] = user.get("user_id")

    analysis = await get_db().analyses.find_one(query)
    if not analysis or (
        user.get("role") == "doctor"
        and not await doctor_patient_access(
            get_db(), user["user_id"], analysis.get("patient_id")
        )
    ):
        raise HTTPException(404, "Analysis not found")

    if "ai_insights" in analysis and analysis["ai_insights"]:
        return analysis["ai_insights"]

    insights = await generate_clinical_insights(analysis)
    try:
        await get_db().analyses.update_one(
            {"_id": analysis_id},
            {"$set": {"ai_insights": insights}}
        )
    except Exception:
        pass

    return insights
