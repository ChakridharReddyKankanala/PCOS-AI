from datetime import datetime,timezone
from uuid import uuid4
from fastapi import APIRouter,Depends,HTTPException,BackgroundTasks
from fastapi.responses import FileResponse
from app.core.deps import get_current_user
from app.core.doctor_access import doctor_patient_access, doctor_patient_ids
from app.db.mongo import get_db
from app.services.otp_service import create_otp_challenge,verify_otp_challenge
from app.services.notification_service import send_otp_email
from app.reporting.llm_service import generate_clinical_summary
from app.reporting.pdf_generator import generate_pdf
from app.core.config import settings
router=APIRouter()
@router.post("/{analysis_id}/generate")
async def generate_report(analysis_id:str,user=Depends(get_current_user)):
    db=get_db(); query={"_id":analysis_id}
    if user["role"] != "doctor": query["patient_id"] = user["user_id"]
    a=await db.analyses.find_one(query)
    if not a: raise HTTPException(404,"Analysis not found")
    if user["role"] == "doctor" and not await doctor_patient_access(db,user["user_id"],a.get("patient_id")):
        raise HTTPException(404,"Analysis not found")
    rid=str(uuid4()); path=f"{settings.REPORT_DIR}/{rid}.pdf"; analysis={k:a.get(k, {}) for k in ["clinical","ultrasound","combined","explainability"]}; summary=generate_clinical_summary(analysis)
    patient=await db.users.find_one({"_id":a["patient_id"]}) or {}
    generate_pdf(path,{"user_id":a["patient_id"],"full_name":patient.get("full_name",a.get("patient_name","Patient")),"email":patient.get("email","")},analysis,summary); now=datetime.now(timezone.utc)
    await db.reports.insert_one({"_id":rid,"analysis_id":analysis_id,"patient_id":a["patient_id"],"file_path":path,"created_at":now,"status":"ready"})
    return {"report_id":rid,"analysis_id":analysis_id,"status":"ready","created_at":now.isoformat()}
@router.get("")
async def report_history(user=Depends(get_current_user)):
    query={"patient_id": {"$in": list(await doctor_patient_ids(get_db(), user["user_id"]))}} if user["role"] == "doctor" else {"patient_id":user["user_id"]}
    cur=get_db().reports.find(query).sort("created_at",-1); out=[]
    async for r in cur:
        patient=await get_db().users.find_one({"_id":r.get("patient_id")}) or {}
        out.append({"report_id":r["_id"],"analysis_id":r["analysis_id"],"patient_id":r.get("patient_id"),"patient_name":patient.get("full_name","Patient"),"created_at":r["created_at"].isoformat(),"status":r["status"]})
    return out
@router.post("/{report_id}/download/request")
async def request_download(report_id:str,bg:BackgroundTasks,user=Depends(get_current_user)):
    query={"_id":report_id}
    if user["role"] != "doctor": query["patient_id"] = user["user_id"]
    r=await get_db().reports.find_one(query)
    if not r: raise HTTPException(404,"Report not found")
    if user["role"] == "doctor" and not await doctor_patient_access(get_db(),user["user_id"],r.get("patient_id")):
        raise HTTPException(404,"Report not found")
    otp=await create_otp_challenge(user["user_id"],f"report_download:{report_id}"); bg.add_task(send_otp_email,user["email"],otp,"report download")
    return {"message":"OTP sent for report download"}
@router.post("/{report_id}/download/verify")
async def verify_download(report_id:str,otp:str,user=Depends(get_current_user)):
    query={"_id":report_id}
    if user["role"] != "doctor": query["patient_id"] = user["user_id"]
    r=await get_db().reports.find_one(query)
    if not r: raise HTTPException(404,"Report not found")
    if user["role"] == "doctor" and not await doctor_patient_access(get_db(),user["user_id"],r.get("patient_id")):
        raise HTTPException(404,"Report not found")
    if not await verify_otp_challenge(user["user_id"],f"report_download:{report_id}",otp): raise HTTPException(400,"Invalid or expired OTP")
    return FileResponse(r["file_path"],media_type="application/pdf",filename=f"PCOS-XAI-{report_id}.pdf")
