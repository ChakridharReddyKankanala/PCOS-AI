# Backend Spec

Scope: this document records the backend state and local HTTP smoke tests from 2026-10-11. The API examples below are actual local responses where possible. Generated IDs are test values; bearer tokens and OTPs are redacted. Training notebook outputs are not proof that a currently loaded artifact has those exact metrics.

## Current Implementation Note (2026-10-12)

The active workflow accepts clinical JSON and an optional ultrasound image. The image checkpoint is a PyTorch state dict extracted into `backend/pcos_efficientnet_b0.pt/pcos_efficientnet_b0/`; the backend reconstructs an EfficientNet-B0 feature extractor with gated attention and a two-class head. Set `ULTRASOUND_PCOS_CLASS_INDEX` to the PCOS output index (default `1`; confirm against the training label order). Image preprocessing currently uses 224 x 224 RGB and ImageNet normalization because checkpoint metadata does not specify transforms. When both model probabilities exist, fusion uses their equal-weight average. Earlier endpoint and runtime details elsewhere in this document may reflect the previous model and should be rechecked before relying on them.

## 1. HOW TO RUN

- **Framework:** FastAPI (`FastAPI(title=settings.APP_NAME, version="1.0.0")`).
- **Start command:** from `backend/`: `uvicorn app.main:app --reload`. The README's documented API URL is `http://127.0.0.1:8000/docs`.
- **Default host / port:** Uvicorn defaults to `127.0.0.1:8000` when no host/port flags are supplied. The local smoke test used `127.0.0.1:8000`.
- **Python:** backend README says Python 3.11+. Local runtime used for this document: Python 3.13.7.
- **MongoDB:** default URI is `mongodb://localhost:27017`, database `pcos_xai`. On connection failure, startup logs a notice and switches to an in-memory mock database; data in that fallback is not persistent.
- **CORS:** enabled with credentials, all methods and headers. Explicit origins include `http://localhost:5173` and `http://127.0.0.1:5173` (among several other local ports). The origin regex also allows any `http` or `https` port on `localhost` or `127.0.0.1`.
- **Authentication:** no API key. Protected routes require `Authorization: Bearer <access_token>` using a JWT issued by the auth endpoints. Login and registration use emailed OTP verification. `/api/analysis/run` requires a valid access token despite `get_optional_user`'s name; `/api/analysis/history` instead returns an empty list if no valid user is found.
- **Configuration:** settings can be supplied through environment variables or `backend/.env`; see `backend/app/core/config.py`. The source has a development JWT-secret default; set a strong `JWT_SECRET` outside development. OTP lifetime defaults to 5 minutes, maximum failed attempts to 5, access token lifetime to 24 hours, and refresh token lifetime to 30 days.
- **Docs:** FastAPI interactive docs are at `/docs`; OpenAPI JSON is at `/openapi.json`.

## 2. ENDPOINTS

Every route below is mounted under the prefix shown. Each code block is copied verbatim from its route function in the active backend.

### `GET /`
Returns service name, running status, and docs path.

```python
@app.get("/")
async def root(): return {"service":settings.APP_NAME,"status":"running","docs":"/docs"}
```

### `GET /api/health`
Pings MongoDB and returns health status.

```python
@router.get("/health")
async def health(): await get_db().command("ping"); return {"status":"healthy","database":"connected"}
```

### `POST /api/auth/register`
Creates a user and starts registration OTP verification.

```python
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
```

### `POST /api/auth/verify-registration`
Validates the registration OTP, marks the account verified, and issues access and refresh tokens.

```python
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
```

### `POST /api/auth/login`
Checks email/password. Sends a registration OTP for unverified accounts or a login OTP for verified accounts.

```python
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
```

### `POST /api/auth/verify-login`
Validates the login OTP and issues access and refresh tokens.

```python
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
```

### `POST /api/auth/refresh`
Validates a refresh token and returns a new access token.

```python
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
```

### `GET /api/users/me`
Returns selected fields for the authenticated user.

```python
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
```

### Patient/doctor access requests

- `GET /api/users/available-doctors` lists doctor accounts for a patient to choose from. Each account is marked `credential_verified`; this prototype does not verify medical credentials.
- `POST /api/users/patient-access-requests` accepts `{"doctor_id":"..."}`. It sends a request to the selected doctor; no reports are shared until the doctor accepts.
- `POST /api/users/doctor-access-requests` accepts `{"patient_email":"..."}`. The patient sees the request in their dashboard and must accept. The response is intentionally generic so the endpoint does not disclose whether a patient account exists.
- `GET /api/users/access-requests` lists requests for the signed-in user. `POST /api/users/access-requests/{request_id}/respond` accepts `{"action":"accept"}` or `{"action":"decline"}` and only the intended recipient can respond.
- Approved requests create the active grant used by doctor history, reports, and follow-up APIs. Either party can revoke the grant at any time.
- Doctors do not receive a patient directory; a patient email is required to send a request.

### Doctor roster and follow-up routes

- `GET /api/users/doctor-patients` lists only patients who have an active grant for the signed-in doctor.
- `DELETE /api/users/doctor-patients/{patient_id}` revokes that doctor's grant. Subsequent requests for the patient's analyses, reports, AI insights, and follow-up plan are denied.
- `GET /api/users/patient-authorized-doctors` lists doctors with an active grant for the signed-in patient; `DELETE /api/users/patient-authorized-doctors/{doctor_id}` lets the patient revoke that grant.
- `GET /api/users/doctor-dashboard-summary` returns counts scoped to the doctor's active grants: patients, saved/recent screenings, screening estimates in the 35%-65% display band, and upcoming/overdue follow-ups.
- `GET` and `PUT /api/users/doctor-patients/{patient_id}/care-plan` read or save that doctor's plan for a patient. The JSON body accepts `clinician_note` (up to 4,000 characters), `follow_up_date` (`YYYY-MM-DD` or `null`), and `status` (`needs_review`, `follow_up_scheduled`, or `follow_up_complete`). Notes are visible to the patient.
- `GET /api/users/patient-care-plans` lists plans for the signed-in patient. Patients retain access to their own plans even if a doctor later revokes access.

### `POST /api/analysis/run`
Validates submitted clinical JSON, optionally processes an ultrasound image, runs available modality models and fusion, and saves an analysis if database insertion works.

```python
@router.post("/run")
async def run_analysis(
    request: Request,
    clinical_json: str = Form(...),
    ultrasound: UploadFile | None = File(None)
):
    user = await get_optional_user(request)
    if not user:
        raise HTTPException(401, "Sign in before generating a report")
    patient_id = user["user_id"]
    patient_name = user.get("full_name", "Patient")

    # Parse clinical JSON
    try:
        raw_clinical = json.loads(clinical_json)
        clinical = ClinicalInput.model_validate(raw_clinical)
        clinical_dict = clinical.model_dump()
        # Merge raw dict keys for extra fields like maritalStatus, irregularPeriods, etc.
        clinical_dict.update(raw_clinical)
    except Exception as e:
        raise HTTPException(422, f"Invalid clinical data: {e}")

    # Process ultrasound file if uploaded
    image_path = None
    if ultrasound and ultrasound.filename:
        suffix = Path(ultrasound.filename).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise HTTPException(400, "Unsupported image format")
        data = await ultrasound.read()
        if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(413, "File too large")
        
        upload_dir = Path(settings.UPLOAD_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)
        image_path = str(upload_dir / f"{uuid4()}{suffix}")
        Path(image_path).write_bytes(data)

    # ML Predictions
    cr = clinical_model.predict(clinical_dict)

    ur = ultrasound_model.predict(image_path) if image_path else {
        "prediction": "NOT_AVAILABLE",
        "probability": None,
        "model_version": ultrasound_model.model_version
    }
    combined = fusion_engine.combine(cr, ur)
    explanation = build_explanation(
        clinical_model, clinical_dict, ultrasound_model, image_path
    )
    aid = str(uuid4())
    now = datetime.now(timezone.utc)

    # Save to MongoDB if available
    try:
        db = get_db()
        await db.analyses.insert_one({
            "_id": aid,
            "patient_id": patient_id,
            "patient_name": patient_name,
            "performed_by": patient_id,
            "clinical_input": clinical_dict,
            "ultrasound_image": image_path,
            "clinical": cr,
            "ultrasound": ur,
            "combined": combined,
            "explainability": explanation,
            "created_at": now
        })
    except Exception as e:
        print(f"[Analysis] DB insert notice (continuing without DB): {e}")

    return {
        "analysis_id": aid,
        "patient_id": patient_id,
        "patient_name": patient_name,
        "clinical_input": clinical_dict,
        "clinical": cr,
        "ultrasound": ur,
        "clinical_report": cr,
        "ultrasound_report": ur,
        "combined": combined,
        "explainability": explanation,
        "created_at": now.isoformat()
    }
```

### `GET /api/analysis/history`
Returns the current patient's analyses, newest first; without a valid user it returns `[]`.

```python
@router.get("/history")
async def history(request: Request):
    user = await get_optional_user(request)
    if not user:
        return []
    try:
        db = get_db()
        cur = db.analyses.find({"patient_id": user["user_id"]}).sort("created_at", -1)
        out = []
        async for x in cur:
            out.append({
                "analysis_id": x["_id"],
                "patient_name": x.get("patient_name", "Patient"),
                "patient_id": x.get("patient_id"),
                "clinical": x.get("clinical", {}),
                "ultrasound": x.get("ultrasound", {}),
                "combined": x.get("combined", {}),
                "created_at": x["created_at"].isoformat() if isinstance(x["created_at"], datetime) else str(x["created_at"])
            })
        return out
    except Exception as error:
        print(f"[Analysis] History read failed: {error}")
        raise HTTPException(500, "Unable to load saved reports")
```

### `GET /api/analysis/doctor-history`
Requires doctor role and returns only analyses for patients who have an active access grant for that doctor. The response includes the clinical input fields needed to flag incomplete submissions in the dashboard.

```python
@router.get("/doctor-history")
async def doctor_history(request: Request):
    user = await get_optional_user(request)
    if not user or user.get("role") != "doctor":
        raise HTTPException(403, "Doctor access required")

    patient_ids = await doctor_patient_ids(get_db(), user["user_id"])
    out = []
    async for analysis in get_db().analyses.find({"patient_id": {"$in": list(patient_ids)}}).sort("created_at", -1):
        patient = await get_db().users.find_one({"_id": analysis.get("patient_id")})
        out.append({
            "analysis_id": analysis["_id"],
            "patient_name": (patient or {}).get("full_name", analysis.get("patient_name", "Patient")),
            "patient_id": analysis.get("patient_id"),
            "created_at": analysis["created_at"].isoformat() if isinstance(analysis.get("created_at"), datetime) else str(analysis.get("created_at")),
            "clinical": analysis.get("clinical", {}),
            "ultrasound": analysis.get("ultrasound", {}),
        })
    return out
```

### `GET /api/analysis/{analysis_id}`
Returns one saved report; patients are restricted to their own patient ID, and doctors must have an active grant for the analysis's patient.

```python
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
        "created_at": analysis["created_at"].isoformat() if isinstance(analysis["created_at"], datetime) else str(analysis["created_at"]),
    }
```

### `POST /api/reports/{analysis_id}/generate`
Creates and stores a PDF report for a saved analysis.

```python
@router.post("/{analysis_id}/generate")
async def generate_report(analysis_id:str,user=Depends(get_current_user)):
    db=get_db(); query={"_id":analysis_id}
    if user["role"] != "doctor": query["patient_id"] = user["user_id"]
    a=await db.analyses.find_one(query)
    if not a: raise HTTPException(404,"Analysis not found")
    if user["role"] == "doctor" and not await doctor_patient_access(db,user["user_id"],a.get("patient_id")):
        raise HTTPException(404,"Analysis not found")
    rid=str(uuid4()); path=f"{settings.REPORT_DIR}/{rid}.pdf"; analysis={k:a[k] for k in ["clinical","ultrasound","combined","explainability"]}; summary=generate_clinical_summary(analysis)
    patient=await db.users.find_one({"_id":a["patient_id"]}) or {}
    generate_pdf(path,{"user_id":a["patient_id"],"full_name":patient.get("full_name",a.get("patient_name","Patient")),"email":patient.get("email","")},analysis,summary); now=datetime.now(timezone.utc)
    await db.reports.insert_one({"_id":rid,"analysis_id":analysis_id,"patient_id":a["patient_id"],"file_path":path,"created_at":now,"status":"ready"})
    return {"report_id":rid,"analysis_id":analysis_id,"status":"ready","created_at":now.isoformat()}
```

### `GET /api/reports`
Returns reports newest first; patients see their own and doctors see only reports for currently authorized patients.

```python
@router.get("")
async def report_history(user=Depends(get_current_user)):
    query={"patient_id": {"$in": list(await doctor_patient_ids(get_db(), user["user_id"]))}} if user["role"] == "doctor" else {"patient_id":user["user_id"]}
    cur=get_db().reports.find(query).sort("created_at",-1); out=[]
    async for r in cur:
        patient=await get_db().users.find_one({"_id":r.get("patient_id")}) or {}
        out.append({"report_id":r["_id"],"analysis_id":r["analysis_id"],"patient_id":r.get("patient_id"),"patient_name":patient.get("full_name","Patient"),"created_at":r["created_at"].isoformat(),"status":r["status"]})
    return out
```

### `POST /api/reports/{report_id}/download/request`
Sends an OTP for a report download.

```python
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
```

### `POST /api/reports/{report_id}/download/verify`
Validates the download OTP and streams a PDF file.

```python
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
```

## 3. REQUEST FORMAT (per endpoint)

All example commands target `http://127.0.0.1:8000`. Auth commands use JSON unless noted. For authenticated calls, set `TOKEN` to the access token and `REFRESH_TOKEN` to the refresh token returned by verification. Shell syntax below uses a POSIX-style shell.

| Endpoint | Content type and fields |
|---|---|
| `GET /` | No body or auth. |
| `GET /api/health` | No body or auth. |
| `POST /api/auth/register` | JSON: `email` (email), `password` (string, min 8), `full_name` (string, min 2), `role` (`patient` or `doctor`), optional `phone` (string or null). |
| `POST /api/auth/verify-registration` | JSON: `user_id` (string), `otp` (6-character string). |
| `POST /api/auth/login` | JSON: `email`, `password`. |
| `POST /api/auth/verify-login` | JSON: `user_id` (string), `otp` (6-character string). |
| `POST /api/auth/refresh` | JSON: `refresh_token` (string). |
| `GET /api/users/me` | No body; bearer access token required. |
| `GET /api/users/available-doctors` | No body; bearer token for a patient required. Doctor credential status is included in each result. |
| `POST /api/users/patient-access-requests` | JSON `doctor_id`; bearer token for a patient required. |
| `POST /api/users/doctor-access-requests` | JSON `patient_email`; bearer token for a doctor required. Does not disclose whether the patient account exists. |
| `GET /api/users/access-requests` | No body; bearer access token required. |
| `POST /api/users/access-requests/{request_id}/respond` | JSON `action` (`accept` or `decline`); bearer token for the request recipient required. |
| `GET /api/users/doctor-patients` | No body; bearer token for a doctor required. |
| `DELETE /api/users/doctor-patients/{patient_id}` | Path field `patient_id`; bearer token for a doctor required. |
| `GET /api/users/patient-authorized-doctors` | No body; bearer token for a patient required. |
| `DELETE /api/users/patient-authorized-doctors/{doctor_id}` | Path field `doctor_id`; bearer token for a patient required. |
| `GET /api/users/doctor-dashboard-summary` | No body; bearer token for a doctor required. |
| `GET /api/users/doctor-patients/{patient_id}/care-plan` | Path field `patient_id`; bearer token for a doctor with active patient access required. |
| `PUT /api/users/doctor-patients/{patient_id}/care-plan` | Path field `patient_id`; JSON `clinician_note`, `follow_up_date`, `status`; bearer token for a doctor with active patient access required. |
| `GET /api/users/patient-care-plans` | No body; bearer token for a patient required. |
| `POST /api/analysis/run` | `multipart/form-data`: required `clinical_json` text containing a JSON object; optional `ultrasound` uploaded file. Requires bearer access token. |
| `GET /api/analysis/history` | No body; optional bearer token (no valid user returns `[]`). |
| `GET /api/analysis/doctor-history` | No body; bearer token for doctor required. |
| `GET /api/analysis/{analysis_id}` | Path field `analysis_id`; no body; bearer access token required. |
| `POST /api/reports/{analysis_id}/generate` | Path field `analysis_id`; no body; bearer access token required. |
| `GET /api/reports` | No body; bearer access token required. |
| `POST /api/reports/{report_id}/download/request` | Path field `report_id`; no body; bearer access token required. |
| `POST /api/reports/{report_id}/download/verify` | Path field `report_id`; query field `otp` (string); no body; bearer access token required. Returns PDF bytes on success. |

### Ultrasound upload and preprocessing

- Multipart field: `ultrasound`.
- Accepted filename extensions: `.jpg`, `.jpeg`, `.png`, `.webp` (case-insensitive). MIME type/content signature is not checked by the route.
- Maximum: 10 MiB (`MAX_UPLOAD_MB=10`, compared against `10 * 1024 * 1024` bytes). The full uploaded content is read before this check.
- Image processing: Pillow opens the saved file, converts to RGB, resizes directly to 224 x 224, casts to `float32`, and adds the batch axis. It sends raw pixel range 0-255 to the model; the code says the model has an internal MobileNetV3 rescaling layer (`1/127.5`, offset `-1.0`). No aspect-ratio preservation or other route-level transform is done.
- An ultrasound file is optional. Without one, ultrasound returns `NOT_AVAILABLE` with a null probability; fusion uses a complete clinical probability if available.

### Clinical features

`clinical_json` must parse as a JSON object accepted by `ClinicalInput`. Schema fields are optional and nullable, but the clinical model only runs when all 38 form inputs are present. BMI, FSH/LH, and waist/hip ratio may be supplied or computed from their source values. If any required input is missing, the clinical result is `NOT_AVAILABLE` with a null probability; the API does not use adapter defaults to produce a prediction. An ultrasound image may still be analyzed independently. There are no application-level min/max/range checks on numeric feature values. Feature values are mapped to the following saved-model column order. All model columns are numeric; inputs are converted to float or binary float before prediction. Units below are from column labels or are `UNKNOWN` when not encoded in source.

| Order | Exact API key(s) -> model column | Model data type | Unit | Min/max checked | Allowed categories / encoding | Adapter fallback when called directly; API requires complete inputs |
|---:|---|---|---|---|---|---|
| 1 | `age` -> `Age (yrs)` | float | years | None | None | Optional; default `27.0`. |
| 2 | `weight` -> `Weight (Kg)` | float | kg | None | None | Optional; default `60.0`. |
| 3 | `height` -> `Height(Cm)` | float | cm | None | None | Optional; default `162.0`. |
| 4 | `bmi` -> `BMI` | float | UNKNOWN | None | None | Optional; default `22.8`, or calculated from weight and height when BMI is missing and both are truthy. |
| 5 | `blood_group` -> `Blood Group` | float | UNKNOWN (numeric dataset code) | None | Categories/valid codes UNKNOWN; no validation | Optional; default `11.0`. |
| 6 | `pulse_rate` -> `Pulse rate(bpm)` | float | bpm | None | None | Optional; default `72.0`. |
| 7 | `respiratory_rate` -> `RR (breaths/min)` | float | breaths/min | None | None | Optional; default `18.0`. |
| 8 | `hb` -> `Hb(g/dl)` | float | g/dl | None | None | Optional; default `12.5`. |
| 9 | `irregular_cycles`, `cycle`, or extra key `irregularPeriods` -> `Cycle(R/I)` | float category | UNKNOWN | None | `True`, `"yes"`, or `"irregular"` -> `4.0` / label `Irregular`; false or any other string -> `2.0` / label `Regular` | Optional; default `2.0` (regular). |
| 10 | `cycle_length` -> `Cycle length(days)` | float | days | None | None | Optional; default `5.0`. |
| 11 | `marriage_status_years` or extra `maritalStatus` -> `Marraige Status (Yrs)` | float | years | None | `maritalStatus == "married"` (case-insensitive) -> `3.0`; any other value -> `0.0` | Optional; default `3.0`. |
| 12 | `pregnant` -> `Pregnant(Y/N)` | float binary | UNKNOWN | None | truthy -> `1.0` (Yes); false -> `0.0` (No) | Optional; default `0.0`. |
| 13 | `abortions` -> `No. of abortions` | float | count | None | None | Optional; default `0.0`. |
| 14 | `beta_hcg_1` -> `I   beta-HCG(mIU/mL)` | float | mIU/mL | None | None | Optional; default `1.99`. |
| 15 | `beta_hcg_2` -> `II    beta-HCG(mIU/mL)` | float | mIU/mL | None | None | Optional; default `1.99`. |
| 16 | `fsh` -> `FSH(mIU/mL)` | float | mIU/mL | None | None | Optional; default `5.5`. |
| 17 | `lh` -> `LH(mIU/mL)` | float | mIU/mL | None | None | Optional; default `4.2`. |
| 18 | `fsh_lh` -> `FSH/LH` | float | ratio | None | None | Optional; computed as FSH/LH when omitted and LH is positive; otherwise default `1.3`. |
| 19 | `hip` -> `Hip(inch)` | float | inch | None | None | Optional; default `36.0`. |
| 20 | `waist` -> `Waist(inch)` | float | inch | None | None | Optional; default `30.0`. |
| 21 | `waist_hip_ratio` -> `Waist:Hip Ratio` | float | ratio | None | None | Optional; computed from waist/hip when omitted and both are truthy; otherwise default `0.83`. |
| 22 | `tsh` -> `TSH (mIU/L)` | float | mIU/L | None | None | Optional; default `2.5`. |
| 23 | `amh` -> `AMH(ng/mL)` | float | ng/mL | None | None | Optional; default `3.5`. |
| 24 | `prolactin` -> `PRL(ng/mL)` | float | ng/mL | None | None | Optional; default `18.0`. |
| 25 | `vitamin_d3` -> `Vit D3 (ng/mL)` | float | ng/mL | None | None | Optional; default `25.0`. |
| 26 | `progesterone` -> `PRG(ng/mL)` | float | ng/mL | None | None | Optional; default `0.5`. |
| 27 | `rbs` -> `RBS(mg/dl)` | float | mg/dl | None | None | Optional; default `95.0`. |
| 28 | `weight_gain` -> `Weight gain(Y/N)` | float binary | UNKNOWN | None | Yes/true/1 -> `1.0`; other strings/false/null -> `0.0` | Optional; missing/null -> `0.0`. |
| 29 | `hair_growth` or `excessiveHair` -> `hair growth(Y/N)` | float binary | UNKNOWN | None | Yes/true/1 -> `1.0`; other strings/false/null -> `0.0` | Optional; missing/null -> `0.0`. |
| 30 | `skin_darkening` -> `Skin darkening (Y/N)` | float binary | UNKNOWN | None | Yes/true/1 -> `1.0`; other strings/false/null -> `0.0` | Optional; missing/null -> `0.0`. |
| 31 | `hair_loss` or `hairLoss` -> `Hair loss(Y/N)` | float binary | UNKNOWN | None | Yes/true/1 -> `1.0`; other strings/false/null -> `0.0` | Optional; missing/null -> `0.0`. |
| 32 | `pimples` or `acne` -> `Pimples(Y/N)` | float binary | UNKNOWN | None | Yes/true/1 -> `1.0`; other strings/false/null -> `0.0` | Optional; missing/null -> `0.0`. |
| 33 | `fast_food` -> `Fast food (Y/N)` | float binary | UNKNOWN | None | Yes/true/1 -> `1.0`; other strings/false/null -> `0.0` | Optional; missing/null -> `0.0`. |
| 34 | `regular_exercise` -> `Reg.Exercise(Y/N)` | float binary | UNKNOWN | None | Yes/true/1 -> `1.0`; other strings/false/null -> `0.0` | Optional; API missing/null -> `0.0` because the validated model dump includes the key as null. The adapter's bare constant default is `1.0` only when the key is absent entirely. |
| 35 | `bp_systolic` -> `BP _Systolic (mmHg)` | float | mmHg | None | None | Optional; default `120.0`. |
| 36 | `bp_diastolic` -> `BP _Diastolic (mmHg)` | float | mmHg | None | None | Optional; default `80.0`. |
| 37 | `follicle_no_left` -> `Follicle No. (L)` | float | count | None | None | Optional; default `4.0`. |
| 38 | `follicle_no_right` -> `Follicle No. (R)` | float | count | None | None | Optional; default `4.0`. |
| 39 | `average_follicle_size_left` -> `Avg. F size (L) (mm)` | float | mm | None | None | Optional; default `15.0`. |
| 40 | `average_follicle_size_right` -> `Avg. F size (R) (mm)` | float | mm | None | None | Optional; default `15.0`. |
| 41 | `endometrium` -> `Endometrium (mm)` | float | mm | None | None | Optional; default `7.5`. |

`testosterone` exists in the Pydantic request schema but is not mapped to a model feature. Extra keys are preserved in the saved `clinical_input`, but only keys mapped above affect this model. `cycle` is typed as a string in the schema; extra aliases mentioned above are merged from the original JSON after schema validation.

### Curl commands

> **Historical examples:** The access-code commands in this smoke-test transcript are obsolete; those routes have been removed. Use the consent-based access request examples below instead.

```sh
curl http://127.0.0.1:8000/
curl http://127.0.0.1:8000/api/health
curl -X POST http://127.0.0.1:8000/api/auth/register -H 'Content-Type: application/json' -d '{"email":"person@example.com","password":"password123","full_name":"Example Patient","role":"patient"}'
curl -X POST http://127.0.0.1:8000/api/auth/verify-registration -H 'Content-Type: application/json' -d '{"user_id":"USER_ID","otp":"000000"}'
curl -X POST http://127.0.0.1:8000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"person@example.com","password":"password123"}'
curl -X POST http://127.0.0.1:8000/api/auth/verify-login -H 'Content-Type: application/json' -d '{"user_id":"USER_ID","otp":"000000"}'
curl -X POST http://127.0.0.1:8000/api/auth/refresh -H 'Content-Type: application/json' -d '{"refresh_token":"REFRESH_TOKEN"}'
curl http://127.0.0.1:8000/api/users/me -H 'Authorization: Bearer TOKEN'
curl -X POST http://127.0.0.1:8000/api/users/patient-access-code -H 'Authorization: Bearer TOKEN'
curl -X POST http://127.0.0.1:8000/api/users/doctor-access/PCOS-XXXXXXXX -H 'Authorization: Bearer TOKEN'
curl -X POST http://127.0.0.1:8000/api/analysis/run -H 'Authorization: Bearer TOKEN' -F 'clinical_json={"age":27,"weight":60,"height":162}' -F 'ultrasound=@./scan.png;type=image/png'
curl http://127.0.0.1:8000/api/analysis/history -H 'Authorization: Bearer TOKEN'
curl http://127.0.0.1:8000/api/analysis/doctor-history -H 'Authorization: Bearer TOKEN'
curl http://127.0.0.1:8000/api/analysis/ANALYSIS_ID -H 'Authorization: Bearer TOKEN'
curl -X POST http://127.0.0.1:8000/api/reports/ANALYSIS_ID/generate -H 'Authorization: Bearer TOKEN'
curl http://127.0.0.1:8000/api/reports -H 'Authorization: Bearer TOKEN'
curl -X POST http://127.0.0.1:8000/api/reports/REPORT_ID/download/request -H 'Authorization: Bearer TOKEN'
curl -X POST 'http://127.0.0.1:8000/api/reports/REPORT_ID/download/verify?otp=000000' -H 'Authorization: Bearer TOKEN' --output report.pdf
```

The following authenticated request examples use `TOKEN` for a bearer access token:

```sh
curl http://127.0.0.1:8000/api/users/available-doctors -H 'Authorization: Bearer TOKEN'
curl -X POST http://127.0.0.1:8000/api/users/patient-access-requests -H 'Authorization: Bearer TOKEN' -H 'Content-Type: application/json' -d '{"doctor_id":"DOCTOR_ID"}'
curl -X POST http://127.0.0.1:8000/api/users/doctor-access-requests -H 'Authorization: Bearer TOKEN' -H 'Content-Type: application/json' -d '{"patient_email":"person@example.com"}'
curl http://127.0.0.1:8000/api/users/access-requests -H 'Authorization: Bearer TOKEN'
curl -X POST http://127.0.0.1:8000/api/users/access-requests/REQUEST_ID/respond -H 'Authorization: Bearer TOKEN' -H 'Content-Type: application/json' -d '{"action":"accept"}'
```

## 4. RESPONSE FORMAT (per endpoint)

Smoke tests were made against the running local server with test accounts in a disposable database. The database and generated test image/PDF were removed afterward. Access/refresh tokens below are redacted from the actual response values. UUIDs and example account values are from that test run.
The doctor-history example below is a historical response shape; current doctor responses are limited to patients with active access grants.

| Endpoint | Actual response example |
|---|---|
| `GET /` | `{"service":"PCOS-XAI","status":"running","docs":"/docs"}` |
| `GET /api/health` | `{"status":"healthy","database":"connected"}` |
| `POST /api/auth/register` | `{"message":"Registration created successfully. Please verify the OTP sent to your email to continue.","user_id":"823eb7a6-3038-45d3-8f15-1e052a2fc8e2"}` |
| `POST /api/auth/verify-registration` | `{"message":"Account verified successfully","access_token":"[redacted]","refresh_token":"[redacted]","token_type":"bearer","role":"patient","user_id":"823eb7a6-3038-45d3-8f15-1e052a2fc8e2","full_name":"Spec patient"}` |
| `POST /api/auth/login` | `{"message":"Verification code sent to your email.","user_id":"823eb7a6-3038-45d3-8f15-1e052a2fc8e2","role":"patient"}` |
| `POST /api/auth/verify-login` | `{"access_token":"[redacted]","refresh_token":"[redacted]","token_type":"bearer","role":"patient","user_id":"823eb7a6-3038-45d3-8f15-1e052a2fc8e2","full_name":"Spec patient"}` |
| `POST /api/auth/refresh` | `{"access_token":"[redacted]","token_type":"bearer"}` |
| `GET /api/users/me` | `{"user_id":"823eb7a6-3038-45d3-8f15-1e052a2fc8e2","email":"api-spec-patient-930f45e8@example.com","phone":null,"full_name":"Spec patient","role":"patient","verified":true}` |
| `POST /api/analysis/run` | Actual selected fields from the response for the generated 32x32 PNG and clinical JSON `{"age":27,"weight":60,"height":162}`: `{"analysis_id":"12661ac5-9214-49fb-9e1d-64856050428e","patient_id":"823eb7a6-3038-45d3-8f15-1e052a2fc8e2","patient_name":"Spec patient","clinical":{"prediction":"Normal","probability":0.0158,"model_version":"RandomForest-Clinical-v1"},"ultrasound":{"prediction":"Normal","probability":0.2966,"model_version":"MobileNetV3-Ultrasound-v1"},"combined":{"prediction":"Normal","probability":0.1562,"confidence_score":84.4,"method":"dual_modal_weighted_average","model_version":"Multimodal-Fusion-v1"},"created_at":"2026-10-11T09:54:08.867764+00:00"}`. The actual full response also includes normalized `clinical_input`, duplicate `clinical_report`/`ultrasound_report` values, and `explainability` (see section 5). |
| `GET /api/analysis/history` | Actual response was a one-element JSON array. Actual response excerpt: `[{"analysis_id":"12661ac5-9214-49fb-9e1d-64856050428e","patient_name":"Spec patient","patient_id":"823eb7a6-3038-45d3-8f15-1e052a2fc8e2","clinical":{"prediction":"Normal","probability":0.0158,"model_version":"RandomForest-Clinical-v1"},"ultrasound":{"prediction":"Normal","probability":0.2966,"model_version":"MobileNetV3-Ultrasound-v1"},"combined":{"prediction":"Normal","probability":0.1562,"confidence_score":84.4,"method":"dual_modal_weighted_average","model_version":"Multimodal-Fusion-v1"},"created_at":"2026-10-11T09:54:08.867000"}]`. The full actual body also included clinical `encoded_values`. |
| `GET /api/analysis/doctor-history` | Actual empty response before the test analysis was created: `[]`. Afterward it returned an array of analyses with `analysis_id`, `patient_name`, `patient_id`, `created_at`, `clinical`, and `ultrasound`. |
| `GET /api/analysis/{analysis_id}` | Actual response excerpt: `{"analysis_id":"12661ac5-9214-49fb-9e1d-64856050428e","patient_id":"823eb7a6-3038-45d3-8f15-1e052a2fc8e2","patient_name":"Spec patient","clinical_input":{"age":27,"weight":60,"height":162,"bmi":null,"blood_group":null,"pulse_rate":null,"respiratory_rate":null,"hb":null,"cycle":null,"cycle_length":null,"irregular_cycles":null,"marriage_status_years":null,"pregnant":null,"abortions":null,"beta_hcg_1":null,"beta_hcg_2":null,"fsh":null,"lh":null,"fsh_lh":null,"testosterone":null,"prolactin":null,"tsh":null,"amh":null,"vitamin_d3":null,"progesterone":null,"rbs":null,"hip":null,"waist":null,"waist_hip_ratio":null,"weight_gain":null,"hair_growth":null,"skin_darkening":null,"hair_loss":null,"pimples":null,"acne":null,"fast_food":null,"regular_exercise":null,"bp_systolic":null,"bp_diastolic":null,"follicle_no_left":null,"follicle_no_right":null,"average_follicle_size_left":null,"average_follicle_size_right":null,"endometrium":null},"clinical":{"prediction":"Normal","probability":0.0158,"model_version":"RandomForest-Clinical-v1"},"ultrasound":{"prediction":"Normal","probability":0.2966,"model_version":"MobileNetV3-Ultrasound-v1"},"combined":{"prediction":"Normal","probability":0.1562,"confidence_score":84.4,"method":"dual_modal_weighted_average","model_version":"Multimodal-Fusion-v1"},"created_at":"2026-10-11T09:54:08.867764+00:00"}`. The actual response also contained encoded values, duplicate `clinical_report`/`ultrasound_report`, and `explainability`. |
| `POST /api/reports/{analysis_id}/generate` | `{"report_id":"c44defb7-4ae1-4481-b3c8-6554cabb7c2e","analysis_id":"12661ac5-9214-49fb-9e1d-64856050428e","status":"ready","created_at":"2026-10-11T09:54:08.963062+00:00"}` |
| `GET /api/reports` | Actual response was a one-element array: `[{"report_id":"c44defb7-4ae1-4481-b3c8-6554cabb7c2e","analysis_id":"12661ac5-9214-49fb-9e1d-64856050428e","patient_id":"823eb7a6-3038-45d3-8f15-1e052a2fc8e2","patient_name":"Spec patient","created_at":"2026-10-11T09:54:08.963000","status":"ready"}]` |
| `POST /api/reports/{report_id}/download/request` | `{"message":"OTP sent for report download"}` |
| `POST /api/reports/{report_id}/download/verify` | Actual response: HTTP 200, `Content-Type: application/pdf`, 4,457 bytes. It is a PDF stream, not JSON. |

Response field interpretation:

- `prediction`: string label, `PCOS`, `Normal`, or an availability/error label. Each model uses a `>= 0.5` threshold for PCOS when it has a probability.
- `probability`: numeric model probability, rounded to 4 decimal places by model adapters; the clinical artifact's verified `classes_` order is `[0, 1]` and its code treats index 1 as PCOS. Ultrasound scalar output is treated as PCOS probability. The image artifact's positive-class semantics are not independently documented.
- `combined.probability`: fused PCOS probability (range expected 0-1); `confidence_score`: `max(p, 1-p) * 100`, rounded to one decimal, thus expected 50-100 when available.
- `combined.method`: `dual_modal_weighted_average`, `clinical_only`, `ultrasound_only`, or `insufficient_data`.
- `analysis_id`, `report_id`, `patient_id`, `user_id`: strings, generally UUIDs.
- `created_at` / `expires_at`: ISO-formatted datetime strings in response JSON. Some Mongo-backed history serialization omits the UTC offset because the database returns naive datetimes.
- `confidence_score` is not a calibrated confidence interval; code only derives it from the binary probability.

The backend performs late fusion. With both modality probabilities it computes `0.5 * clinical_probability + 0.5 * ultrasound_probability`, rounded to 4 decimals. The weights are fixed in backend code and cannot be sent by the client. If only one probability exists, it uses that modality directly.

## 5. EXPLAINABILITY

- **Clinical:** the API computes per-patient SHAP values for the loaded Random Forest, using up to 100 complete rows from `backend/model_weights/clinical/PCOS_data.csv` as the background. `top_features` contains up to 8 features ordered by absolute SHAP value, with the encoded value, signed SHAP value, and risk direction. `feature_importance` remains as a compatibility field; its `importance` is the absolute local SHAP value, not global forest importance. If SHAP fails, the API returns the existing global feature-importance result with status `FALLBACK_GLOBAL_IMPORTANCE`.
- **Ultrasound:** for a supplied image and available model, Grad-CAM++ runs against the loaded PyTorch EfficientNet-B0 using the same preprocessing and configured `ULTRASOUND_PCOS_CLASS_INDEX` as prediction. The result includes the PCOS probability, explained class, a base64 PNG overlay, and a compact heatmap summary. A missing image is `NOT_AVAILABLE`; model or explanation failures are reported without blocking the prediction response.
- **Fusion:** when both probabilities are available, the explanation includes the equal-weight average and each modality's algebraic contribution relative to 0.5. These are model explanations, not medical causation or clinical diagnosis.
- **Top-level explanation:** `explainability` contains `clinical`, `ultrasound`, `fusion` when both modalities are available, and a summary string. The saved report endpoint returns this object so history views can render the image overlay.

## 6. ERRORS

FastAPI HTTP exceptions serialize as `{"detail": ...}`. Local smoke tests confirmed the bad-extension and missing-field responses below; other cases are derived from the source route/validation code.

| Failure | HTTP status | JSON body / behavior |
|---|---:|---|
| Missing, invalid, or expired bearer token on `POST /api/analysis/run` | 401 | `{"detail":"Sign in before generating a report"}` |
| Unsupported upload filename extension | 400 | Actual: `{"detail":"Unsupported image format"}` |
| Upload larger than configured 10 MiB | 413 | `{"detail":"File too large"}` |
| Missing multipart `clinical_json` | 422 | Actual FastAPI body: `{"detail":[{"type":"missing","loc":["body","clinical_json"],"msg":"Field required","input":null}]}` |
| Malformed JSON or Pydantic clinical schema validation failure | 422 | `{"detail":"Invalid clinical data: <exception text>"}`; exact exception text depends on input. |
| Out-of-range clinical numeric values | No range check exists | No range-specific response. Values are converted/mapped and passed to prediction; a downstream conversion/prediction error is returned inside the model result rather than as an HTTP error when caught there. |
| Model unavailable | Usually HTTP 200 from analysis route | Clinical: `{"prediction":"UNAVAILABLE","probability":0.5,"model_version":"RandomForest-Clinical-v1"}`. Ultrasound: `{"prediction":"MODEL_UNAVAILABLE","probability":null,"model_version":"MobileNetV3-Ultrasound-v1"}`. Fusion consumes any non-null fallback probability; with clinical unavailable and ultrasound absent, 0.5 is treated as available and can yield combined `prediction: "PCOS"` because the threshold is `>= 0.5`. |
| Caught model inference error | Usually HTTP 200 from analysis route | Model result is `{"prediction":"ERROR","probability":null,"error":"<exception text>","model_version":"..."}`. |
| Duplicate registration email or phone | 409 | `{"detail":"Email is already registered"}` or `{"detail":"Phone number is already registered"}` |
| Invalid login password/email | 401 | `{"detail":"Invalid email address or password"}` |
| Invalid/expired OTP | 400 | Auth verify routes: `{"detail":"Invalid or expired OTP code"}`. Report download verify: `{"detail":"Invalid or expired OTP"}`. |
| Missing account during OTP verification | 404 | `{"detail":"User account not found"}` |
| Invalid refresh token | 401 | `{"detail":"Invalid refresh token"}` |
| Authenticated user missing / bad access token for dependency-protected APIs | 401 | `{"detail":"Invalid or expired access token"}` or `{"detail":"User not found"}`; HTTPBearer may reject a missing header before the dependency with its standard 403 response. |
| Wrong role | 403 | `{"detail":"Insufficient permissions"}` or route-specific `{"detail":"Doctor access required"}` |
| Missing saved analysis/report | 404 | Analysis lookup: `{"detail":"Saved report not found"}` or `{"detail":"Analysis not found"}`. Report routes: `{"detail":"Report not found"}`. |
| Analysis history DB read fails | 500 | `{"detail":"Unable to load saved reports"}` |
| Image has an accepted suffix but invalid image bytes | No route content-signature validation | Image decode error is caught by `ultrasound_model.predict` and is returned as a model `ERROR` result; this was not included in the HTTP smoke tests. |

## 7. MODELS AND PERFORMANCE

### Model artifacts and runtime libraries

- Clinical artifact: `backend/model_weights/clinical/pcos_model.pkl` (Joblib) and `pcos_features.pkl` (Joblib feature-column order). Runtime model version string: `RandomForest-Clinical-v1`.
- Ultrasound artifact: `backend/model_weights/ultrasound/mobilenetv3_finetuned_final.keras/` containing `config.json`, `metadata.json`, and `model.weights.h5`. Runtime model version string: `MobileNetV3-Ultrasound-v1`. The active model code loads this directory and performs a zero-input warmup at 224 x 224 x 3.
- Fusion version string: `Multimodal-Fusion-v1`; fixed 0.5/0.5 weighted average if both probabilities are present.
- `backend/requirements.txt` pins FastAPI 0.116.1, Uvicorn 0.35.0, TensorFlow 2.20.0, NumPy 2.2.6, pandas 2.3.3, scikit-learn 1.7.2, Joblib 1.5.2, Pillow 11.3.0, Motor 3.7.1, and other API/reporting dependencies. Local runtime reported Keras 3.15.1 and Python 3.13.7. Ultrasound `metadata.json` says the model was saved with Keras 3.13.2. Loading the clinical pickle emitted a scikit-learn warning that it was serialized with 1.9.0 while runtime scikit-learn is 1.7.2.

### Dataset and metrics evidence

- Archived notebook `unused_files_archive/clicinal-harmonical (1).ipynb` reads `C:/Users/chakr/Desktop/PCOS/2K DS/PCOS_extended_dataset.csv`; its stored output shows shape `(2000, 44)`.
- The notebook code uses `train_test_split(test_size=0.2, random_state=42, stratify=y)`, yielding 1,600 training and 400 test rows if applied to all 2,000 rows.
- A stored notebook evaluation output for an `rf` model reports confusion matrix `[[278, 0], [1, 121]]`, accuracy `0.9975`, precision `1.0000`, recall `0.9918`, F1 `0.9959`, and ROC-AUC `0.9999`. Its 5-fold stratified CV output reports accuracy `0.9945 ± 0.0043`, precision `0.9951 ± 0.0066`, recall `0.9869 ± 0.0098`, F1 `0.9909 ± 0.0071`, and ROC-AUC `0.9999 ± 0.0001`.
- The same notebook contains a later tuned Random Forest definition (700 trees, max depth 10, `max_features="sqrt"`, minimum leaf 2, split 2, random state 42), but its test metrics cell has no stored output. It is UNKNOWN whether the current `pcos_model.pkl` is this tuned model or the earlier `rf` used for the stored metric output.
- The archived `Untitled.ipynb` has a stored interactive example (PCOS probability 81.93%, no-PCOS probability 18.07%) but does not establish an evaluation metric for the deployed artifact.
- No dataset, split, accuracy, precision, recall, F1, or AUC evidence for the ultrasound artifact or the fused system was found in active docs or the inspected notebooks. Fused model metrics are UNKNOWN.
- The notebooks are in `unused_files_archive/`; they are research artifacts, not the runtime training pipeline. Their execution state is marked not executed even though saved output records are present.

## 8. ANYTHING ELSE the frontend must know

- Extra endpoint: `GET /api/health`; root `GET /` returns a basic service status. FastAPI docs are available under `/docs`.
- No rate limiting is implemented in the inspected backend.
- Model objects load at module import and ultrasound performs startup warmup. The first client request may therefore not bear the full model-load cost, but no timing guarantees or benchmark are in code. CPU/GPU selection is not configured in backend code; actual device is UNKNOWN.
- The backend stores uploaded images under `uploads/` and generated PDFs under `generated_reports/` by default. Paths, rather than public URLs/base64 assets, appear in explainability output. The API does not expose an image retrieval endpoint in the inspected routes.
- Analysis insertion failures are logged and swallowed, so `/run` may still return a result that cannot later be fetched from history. Report generation and history/download routes rely on database records.
- OTP is printed to application logs in development and sent via SMTP when configured; without SMTP host, it is logged. Do not rely on that behavior as a client contract.
- `/api/analysis/run` accepts a missing ultrasound but does not permit an unauthenticated user. Existing front-end assessment forms should send a JSON string in multipart field `clinical_json`, not a JSON request body.
- Clinical `probability` is P(class 1) according to the loaded artifact (`classes_ == [0, 1]`), and the code labels that class PCOS. Ultrasound scalar output is treated as PCOS probability, but its output semantics are not documented in metadata.

### UNKNOWN / needs confirmation

- Whether the ultrasound artifact's scalar output is calibrated and definitively means P(PCOS present).
- Whether the deployed clinical pickle corresponds to the earlier notebook `rf`, the later tuned model, or another training run.
- Ultrasound dataset name/size, training/test split, class mapping, validation metrics, and calibrated probability semantics.
- Fused-result evaluation metrics and clinical validation evidence.
- Numeric feature bounds and official blood-group/category value sets; the code performs no min/max checks.
- Intended unit for BMI, blood group code mapping, cycle-length semantics, and any category-label conventions beyond the explicit code mappings above.
- Whether `testosterone` is intentionally collected but unused by the clinical model.
- Whether returning the stored source image path under `heatmap_path` is intentional; no computed heatmap is present.
- Production GPU/CPU expectation, serving latency, model concurrency limits, and whether rate limiting is handled by infrastructure outside this repository.
- Whether 10 MiB is the desired product limit and whether MIME/content validation should be required.