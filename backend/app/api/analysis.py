import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.core.config import settings
from app.core.deps import require_roles
from app.core.doctor_access import doctor_patient_access, doctor_patient_ids
from app.core.security import decode_token
from app.db.mongo import get_db
from app.explainability.service import build_explanation
from app.ml.clinical_model import clinical_model
from app.ml.fusion_engine import fusion_engine
from app.ml.ultrasound_model import ultrasound_model
from app.schemas.analysis import ClinicalInput
from app.services.llm_service import generate_clinical_insights, generate_fallback_insights

router = APIRouter()


async def get_optional_user(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    user = await get_db().users.find_one({"_id": payload["sub"]})
    if user:
        user["user_id"] = user["_id"]
        return user
    return None


@router.post("/run")
async def run_analysis(
    request: Request,
    clinical_json: str = Form(...),
    ultrasound: UploadFile | None = File(None),
):
    user = await get_optional_user(request)
    if not user:
        raise HTTPException(401, "Sign in before generating a report")
    patient_id = user["user_id"]
    patient_name = user.get("full_name", "Patient")

    try:
        raw_clinical = json.loads(clinical_json)
        clinical = ClinicalInput.model_validate(raw_clinical)
        clinical_dict = clinical.model_dump()
        clinical_dict.update(raw_clinical)
    except Exception as error:
        raise HTTPException(422, f"Invalid clinical data: {error}")

    image_path = None
    if ultrasound and ultrasound.filename:
        suffix = Path(ultrasound.filename).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise HTTPException(400, "Unsupported image format")
        image_data = await ultrasound.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
        if len(image_data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(413, "File too large")
        upload_dir = Path(settings.UPLOAD_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)
        image_path = str(upload_dir / f"{uuid4()}{suffix}")
        Path(image_path).write_bytes(image_data)

    clinical_result = clinical_model.predict(clinical_dict)
    ultrasound_result = ultrasound_model.predict(image_path) if image_path else {
        "prediction": "NOT_AVAILABLE",
        "probability": None,
        "model_version": ultrasound_model.model_version,
        "message": (
            "Ultrasound estimate unavailable because no image was "
            "provided."
        ),
    }
    combined = fusion_engine.combine(clinical_result, ultrasound_result)
    explanation = build_explanation(
        clinical_model,
        clinical_dict,
        ultrasound_model,
        image_path,
        clinical_result=clinical_result,
    )
    analysis_id = str(uuid4())
    created_at = datetime.now(timezone.utc)

    analysis_payload = {
        "combined": combined,
        "clinical": clinical_result,
        "ultrasound": ultrasound_result,
        "clinical_input": clinical_dict,
        "explainability": explanation,
    }
    ai_insights = await generate_clinical_insights(analysis_payload)

    try:
        await get_db().analyses.insert_one({
            "_id": analysis_id,
            "patient_id": patient_id,
            "patient_name": patient_name,
            "performed_by": patient_id,
            "clinical_input": clinical_dict,
            "ultrasound_image": image_path,
            "clinical": clinical_result,
            "ultrasound": ultrasound_result,
            "combined": combined,
            "explainability": explanation,
            "ai_insights": ai_insights,
            "created_at": created_at,
        })
    except Exception as error:
        print(f"[Analysis] DB insert notice (continuing without DB): {error}")

    return {
        "analysis_id": analysis_id,
        "patient_id": patient_id,
        "patient_name": patient_name,
        "clinical_input": clinical_dict,
        "clinical": clinical_result,
        "ultrasound": ultrasound_result,
        "clinical_report": clinical_result,
        "ultrasound_report": ultrasound_result,
        "combined": combined,
        "explainability": explanation,
        "ai_insights": ai_insights,
        "created_at": created_at.isoformat(),
    }


@router.get("/history")
async def history(request: Request):
    user = await get_optional_user(request)
    if not user:
        return []
    try:
        cursor = get_db().analyses.find({"patient_id": user["user_id"]}).sort("created_at", -1)
        results = []
        async for analysis in cursor:
            results.append({
                "analysis_id": analysis["_id"],
                "patient_name": analysis.get("patient_name", "Patient"),
                "patient_id": analysis.get("patient_id"),
                "clinical": analysis.get("clinical", {}),
                "ultrasound": analysis.get("ultrasound", {}),
                "combined": analysis.get("combined", {}),
                "created_at": analysis["created_at"].isoformat()
                if isinstance(analysis["created_at"], datetime)
                else str(analysis["created_at"]),
            })
        return results
    except Exception as error:
        print(f"[Analysis] History read failed: {error}")
        raise HTTPException(500, "Unable to load saved reports")


@router.get("/doctor-history")
async def doctor_history(user=Depends(require_roles("doctor"))):
    db = get_db()
    patient_ids = await doctor_patient_ids(db, user["user_id"])
    if not patient_ids:
        return []

    results = []
    cursor = db.analyses.find({"patient_id": {"$in": list(patient_ids)}}).sort("created_at", -1)
    async for analysis in cursor:
        patient = await db.users.find_one({"_id": analysis.get("patient_id")})
        results.append({
            "analysis_id": analysis["_id"],
            "patient_name": (patient or {}).get("full_name", analysis.get("patient_name", "Patient")),
            "patient_id": analysis.get("patient_id"),
            "created_at": analysis["created_at"].isoformat()
            if isinstance(analysis.get("created_at"), datetime)
            else str(analysis.get("created_at")),
            "clinical": analysis.get("clinical", {}),
            "ultrasound": analysis.get("ultrasound", {}),
            "combined": analysis.get("combined", {}),
            "clinical_input": analysis.get("clinical_input", {}),
        })
    return results


@router.get("/{analysis_id}")
async def get_analysis(analysis_id: str, request: Request):
    user = await get_optional_user(request)
    if not user:
        raise HTTPException(401, "Authentication required")

    query = {"_id": analysis_id}
    if user.get("role") != "doctor":
        query["patient_id"] = user["user_id"]
    analysis = await get_db().analyses.find_one(query)
    if not analysis:
        raise HTTPException(404, "Saved report not found")
    if user.get("role") == "doctor" and not await doctor_patient_access(
        get_db(), user["user_id"], analysis.get("patient_id")
    ):
        raise HTTPException(404, "Saved report not found")

    return {
        "analysis_id": analysis["_id"],
        "patient_id": analysis["patient_id"],
        "patient_name": analysis.get("patient_name", "Patient"),
        "clinical_input": analysis.get("clinical_input", {}),
        "clinical": analysis.get("clinical", {}),
        "ultrasound": analysis.get("ultrasound", {}),
        "clinical_report": analysis.get("clinical", {}),
        "ultrasound_report": analysis.get("ultrasound", {}),
        "combined": analysis.get("combined", {}),
        "explainability": analysis.get("explainability", {}),
        "ai_insights": analysis.get("ai_insights") or generate_fallback_insights(analysis),
        "created_at": analysis["created_at"].isoformat()
        if isinstance(analysis["created_at"], datetime)
        else str(analysis["created_at"]),
    }