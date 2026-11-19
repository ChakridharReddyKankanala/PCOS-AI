# PCOS-XAI Backend

FastAPI + MongoDB backend for a multimodal PCOS research screening application.

## Included
- Patient and Doctor accounts
- Password hashing
- OTP at registration and login
- JWT access/refresh tokens
- Consent-based access requests between patients and doctors; access starts only after recipient approval
- Clinical model adapter
- EfficientNet-B0 gated-attention ultrasound classifier
- Equal-weight fusion of available model probabilities
- Clinical analysis result adapter
- SHAP adapter
- LLM report adapter
- PDF generation
- Report history
- OTP-protected report downloads

## Important
The API accepts clinical values and optional ultrasound images. The image classifier checkpoint is under `backend/pcos_efficientnet_b0.pt/pcos_efficientnet_b0/`. Set `ULTRASOUND_PCOS_CLASS_INDEX` to the output index used for the PCOS class (defaults to `1`; confirm against training labels). The checkpoint does not include class-name or preprocessing metadata; the adapter currently uses ImageNet normalization and 224 x 224 input. Outputs are research estimates, not clinical diagnoses.

## Run
1. Python 3.11+
2. MongoDB running
3. Copy `.env.example` to `.env` and set JWT_SECRET
4. `pip install -r requirements.txt`
5. `uvicorn app.main:app --reload`
6. Open `http://127.0.0.1:8000/docs`

## Core APIs
POST /api/auth/register
POST /api/auth/verify-registration
POST /api/auth/login
POST /api/auth/verify-login
POST /api/auth/refresh
GET /api/users/me
GET /api/users/available-doctors
POST /api/users/patient-access-requests
POST /api/users/doctor-access-requests
GET /api/users/access-requests
POST /api/users/access-requests/{request_id}/respond
GET /api/users/doctor-patients
GET /api/users/patient-authorized-doctors
POST /api/analysis/run
GET /api/analysis/history
POST /api/reports/{analysis_id}/generate
GET /api/reports
POST /api/reports/{report_id}/download/request
POST /api/reports/{report_id}/download/verify
GET /api/health

## Production hardening
Use a real SMS/email OTP provider, HTTPS, rate limiting, secret management, audit logs, stronger doctor-patient authorization, and formal clinical validation before real clinical use.
