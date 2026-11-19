from datetime import date, datetime, timezone, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.core.deps import get_current_user, require_roles
from app.core.doctor_access import (
    care_plan_response,
    doctor_patient_access,
    doctor_patient_ids,
    patient_doctor_ids,
)
from app.db.mongo import get_db

router = APIRouter()


class PatientAccessRequestInput(BaseModel):
    doctor_id: str = Field(min_length=1)


class DoctorAccessRequestInput(BaseModel):
    patient_email: EmailStr


class AccessRequestResponseInput(BaseModel):
    action: Literal["accept", "decline"]


class CarePlanInput(BaseModel):
    clinician_note: str = Field(default="", max_length=4000)
    follow_up_date: date | None = None
    status: Literal["needs_review", "follow_up_scheduled", "follow_up_complete"] = "needs_review"


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {
        key: user.get(key)
        for key in [
            "user_id",
            "email",
            "phone",
            "full_name",
            "role",
            "verified"
        ]
    }


def _pending_request_query(doctor_id, patient_id):
    return {
        "doctor_id": doctor_id,
        "patient_id": patient_id,
        "status": "pending",
    }


async def _create_access_request(db, doctor_id, patient_id, requested_by):
    pending = await db.access_requests.find_one(
        _pending_request_query(doctor_id, patient_id)
    )
    if pending:
        return pending, False

    now = datetime.now(timezone.utc)
    request = {
        "doctor_id": doctor_id,
        "patient_id": patient_id,
        "requested_by": requested_by,
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }
    await db.access_requests.insert_one(request)
    return request, True


@router.get("/available-doctors")
async def available_doctors(patient=Depends(require_roles("patient"))):
    db = get_db()
    doctors = []
    async for doctor in db.users.find({"role": "doctor"}):
        if doctor["_id"] == patient["user_id"]:
            continue
        access = await doctor_patient_access(db, doctor["_id"], patient["user_id"])
        pending = await db.access_requests.find_one(
            _pending_request_query(doctor["_id"], patient["user_id"])
        )
        doctors.append({
            "doctor_id": doctor["_id"],
            "full_name": doctor.get("full_name", "Doctor"),
            "credential_verified": bool(doctor.get("credential_verified", False)),
            "access_granted": access,
            "request_pending": bool(pending),
        })
    return sorted(doctors, key=lambda doctor: doctor["full_name"].casefold())


@router.post("/patient-access-requests")
async def request_doctor_access(
    data: PatientAccessRequestInput,
    patient=Depends(require_roles("patient")),
):
    db = get_db()
    doctor = await db.users.find_one({"_id": data.doctor_id, "role": "doctor"})
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    if await doctor_patient_access(db, doctor["_id"], patient["user_id"]):
        raise HTTPException(status_code=409, detail="This doctor already has access")

    request, created = await _create_access_request(
        db, doctor["_id"], patient["user_id"], requested_by="patient"
    )
    return {
        "request_id": request.get("_id"),
        "status": request["status"],
        "message": "Access request sent to the doctor" if created else "An access request is already pending",
    }


@router.post("/doctor-access-requests")
async def request_patient_access(
    data: DoctorAccessRequestInput,
    doctor=Depends(require_roles("doctor")),
):
    db = get_db()
    patient = await db.users.find_one({
        "email": str(data.patient_email).lower().strip(),
        "role": "patient",
    })
    if patient and not await doctor_patient_access(db, doctor["user_id"], patient["_id"]):
        await _create_access_request(
            db, doctor["user_id"], patient["_id"], requested_by="doctor"
        )

    return {
        "message": "If that patient account exists, an access request is now available in their dashboard."
    }


@router.get("/access-requests")
async def access_requests(user=Depends(get_current_user)):
    db = get_db()
    query = {"doctor_id": user["user_id"]} if user["role"] == "doctor" else {"patient_id": user["user_id"]}
    results = []
    async for request in db.access_requests.find(query):
        patient = await db.users.find_one({"_id": request.get("patient_id")}) or {}
        doctor = await db.users.find_one({"_id": request.get("doctor_id")}) or {}
        results.append({
            "request_id": request.get("_id"),
            "doctor_id": request.get("doctor_id"),
            "doctor_name": doctor.get("full_name", "Doctor"),
            "patient_id": request.get("patient_id"),
            "patient_name": patient.get("full_name", "Patient"),
            "requested_by": request.get("requested_by"),
            "status": request.get("status", "pending"),
            "created_at": request.get("created_at").isoformat()
            if request.get("created_at")
            else None,
        })
    return sorted(results, key=lambda request: request.get("created_at") or "", reverse=True)


@router.post("/access-requests/{request_id}/respond")
async def respond_to_access_request(
    request_id: str,
    data: AccessRequestResponseInput,
    user=Depends(get_current_user),
):
    db = get_db()
    request = await db.access_requests.find_one({"_id": request_id})
    if not request or request.get("status") != "pending":
        raise HTTPException(status_code=404, detail="Pending access request not found")

    expected_recipient_role = "doctor" if request.get("requested_by") == "patient" else "patient"
    expected_recipient_id = request.get(
        "doctor_id" if expected_recipient_role == "doctor" else "patient_id"
    )
    if user.get("role") != expected_recipient_role or user["user_id"] != expected_recipient_id:
        raise HTTPException(status_code=404, detail="Pending access request not found")

    now = datetime.now(timezone.utc)
    status = "approved" if data.action == "accept" else "declined"
    result = await db.access_requests.update_one(
        {"_id": request_id, "status": "pending"},
        {"$set": {"status": status, "updated_at": now}},
    )
    if not result.modified_count:
        raise HTTPException(status_code=409, detail="This request has already been answered")

    if data.action == "accept":
        await db.patient_access.insert_one({
            "doctor_id": request["doctor_id"],
            "patient_id": request["patient_id"],
            "used": True,
            "authorized_at": now,
            "source_request_id": request_id,
        })

    return {"request_id": request_id, "status": status}


@router.get("/doctor-patients")
async def doctor_patients(doctor=Depends(require_roles("doctor"))):
    db = get_db()
    patient_ids = await doctor_patient_ids(db, doctor["user_id"])
    patients = []
    for patient_id in patient_ids:
        patient = await db.users.find_one({"_id": patient_id})
        if patient:
            patients.append({
                "patient_id": patient_id,
                "full_name": patient.get("full_name", "Patient"),
            })
    return sorted(patients, key=lambda patient: patient["full_name"].casefold())


@router.get("/doctor-dashboard-summary")
async def doctor_dashboard_summary(doctor=Depends(require_roles("doctor"))):
    db = get_db()
    patient_ids = await doctor_patient_ids(db, doctor["user_id"])
    now = datetime.now(timezone.utc)
    recent_cutoff = now - timedelta(days=7)
    upcoming_cutoff = now.date() + timedelta(days=7)
    screenings = 0
    screenings_last_7_days = 0
    near_display_threshold = 0

    if patient_ids:
        cursor = db.analyses.find({"patient_id": {"$in": list(patient_ids)}})
        async for analysis in cursor:
            screenings += 1
            created_at = analysis.get("created_at")
            if created_at:
                if not isinstance(created_at, datetime):
                    created_at = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                if created_at >= recent_cutoff:
                    screenings_last_7_days += 1

            probability = analysis.get("combined", {}).get("probability")
            if isinstance(probability, (int, float)) and 0.35 <= probability < 0.65:
                near_display_threshold += 1

    follow_ups_due_soon = 0
    overdue_follow_ups = 0
    async for plan in db.care_plans.find({"doctor_id": doctor["user_id"]}):
        if plan.get("patient_id") not in patient_ids:
            continue
        date_value = plan.get("follow_up_date")
        if not date_value or plan.get("status") != "follow_up_scheduled":
            continue
        follow_up_date = date.fromisoformat(str(date_value)[:10])
        if follow_up_date < now.date():
            overdue_follow_ups += 1
        elif follow_up_date <= upcoming_cutoff:
            follow_ups_due_soon += 1

    return {
        "authorized_patients": len(patient_ids),
        "saved_screenings": screenings,
        "screenings_last_7_days": screenings_last_7_days,
        "near_display_threshold": near_display_threshold,
        "follow_ups_due_soon": follow_ups_due_soon,
        "overdue_follow_ups": overdue_follow_ups,
    }


@router.delete("/doctor-patients/{patient_id}")
async def revoke_patient_access(
    patient_id: str,
    doctor=Depends(require_roles("doctor")),
):
    db = get_db()
    if not await doctor_patient_ids(db, doctor["user_id"]):
        raise HTTPException(status_code=404, detail="Patient access not found")

    result = await db.patient_access.update_many(
        {
            "doctor_id": doctor["user_id"],
            "patient_id": patient_id,
            "used": True,
            "revoked_at": {"$exists": False},
        },
        {"$set": {"revoked_at": datetime.now(timezone.utc)}},
    )
    if not result.modified_count:
        raise HTTPException(status_code=404, detail="Patient access not found")
    return {"message": "Patient access revoked"}


@router.get("/patient-authorized-doctors")
async def patient_authorized_doctors(patient=Depends(require_roles("patient"))):
    db = get_db()
    doctor_ids = await patient_doctor_ids(db, patient["user_id"])
    doctors = []
    for doctor_id in doctor_ids:
        doctor = await db.users.find_one({"_id": doctor_id})
        if doctor:
            doctors.append({
                "doctor_id": doctor_id,
                "full_name": doctor.get("full_name", "Doctor"),
            })
    return sorted(doctors, key=lambda doctor: doctor["full_name"].casefold())


@router.delete("/patient-authorized-doctors/{doctor_id}")
async def revoke_doctor_access(
    doctor_id: str,
    patient=Depends(require_roles("patient")),
):
    result = await get_db().patient_access.update_many(
        {
            "patient_id": patient["user_id"],
            "doctor_id": doctor_id,
            "used": True,
            "revoked_at": {"$exists": False},
        },
        {"$set": {"revoked_at": datetime.now(timezone.utc)}},
    )
    if not result.modified_count:
        raise HTTPException(status_code=404, detail="Doctor access not found")
    return {"message": "Doctor access revoked"}


@router.get("/doctor-patients/{patient_id}/care-plan")
async def get_doctor_care_plan(
    patient_id: str,
    doctor=Depends(require_roles("doctor")),
):
    db = get_db()
    if not await doctor_patient_access(db, doctor["user_id"], patient_id):
        raise HTTPException(status_code=404, detail="Patient access not found")
    plan = await db.care_plans.find_one({
        "doctor_id": doctor["user_id"],
        "patient_id": patient_id,
    })
    return care_plan_response(plan or {})


@router.put("/doctor-patients/{patient_id}/care-plan")
async def save_doctor_care_plan(
    patient_id: str,
    data: CarePlanInput,
    doctor=Depends(require_roles("doctor")),
):
    db = get_db()
    if not await doctor_patient_access(db, doctor["user_id"], patient_id):
        raise HTTPException(status_code=404, detail="Patient access not found")

    plan = {
        "doctor_id": doctor["user_id"],
        "patient_id": patient_id,
        "clinician_note": data.clinician_note.strip(),
        "follow_up_date": data.follow_up_date.isoformat() if data.follow_up_date else None,
        "status": data.status,
        "updated_at": datetime.now(timezone.utc),
    }
    await db.care_plans.update_one(
        {"doctor_id": doctor["user_id"], "patient_id": patient_id},
        {"$set": plan},
        upsert=True,
    )
    return care_plan_response(plan)


@router.get("/patient-care-plans")
async def patient_care_plans(patient=Depends(require_roles("patient"))):
    db = get_db()
    plans = []
    async for plan in db.care_plans.find({"patient_id": patient["user_id"]}):
        doctor = await db.users.find_one({"_id": plan.get("doctor_id")}) or {}
        plans.append({
            "doctor_name": doctor.get("full_name", "Doctor"),
            **care_plan_response(plan),
        })
    return sorted(
        plans,
        key=lambda plan: plan.get("updated_at") or "",
        reverse=True,
    )