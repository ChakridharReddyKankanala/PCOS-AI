async def doctor_patient_access(db, doctor_id, patient_id):
    cursor = db.patient_access.find({
        "doctor_id": doctor_id,
        "patient_id": patient_id,
        "used": True,
    })
    async for grant in cursor:
        if not grant.get("revoked_at"):
            return True
    return False


async def doctor_patient_ids(db, doctor_id):
    cursor = db.patient_access.find({"doctor_id": doctor_id, "used": True})
    patient_ids = set()
    async for grant in cursor:
        if grant.get("patient_id") and not grant.get("revoked_at"):
            patient_ids.add(grant["patient_id"])
    return patient_ids


async def patient_doctor_ids(db, patient_id):
    cursor = db.patient_access.find({"patient_id": patient_id, "used": True})
    doctor_ids = set()
    async for grant in cursor:
        if grant.get("doctor_id") and not grant.get("revoked_at"):
            doctor_ids.add(grant["doctor_id"])
    return doctor_ids


def care_plan_response(plan):
    return {
        "clinician_note": plan.get("clinician_note", ""),
        "follow_up_date": plan.get("follow_up_date"),
        "status": plan.get("status", "needs_review"),
        "updated_at": plan.get("updated_at").isoformat()
        if plan.get("updated_at")
        else None,
    }
