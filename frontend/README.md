# PCOS Screen

A React frontend for a multimodal PCOS screening research project. An ultrasound image goes to an EfficientNet-B0 gated-attention model, clinical values go to a Random Forest, and the backend averages the available probabilities.

It is built for the FastAPI backend described in the Backend Spec: OTP sign-in, patient and doctor roles, saved screenings, and PDF reports.

## Run it

Start the backend first (`uvicorn app.main:app --reload` in `backend/`, which serves `http://127.0.0.1:8000`), then:

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Needs Node 20.19 or newer. The backend already allows `http://localhost:5173` through CORS. To point at another address, copy `.env.example` to `.env.local` and set `VITE_API_URL`. For a deployed site, add the site's address to the backend's CORS origins.

## Pages

| Page | Address | Who | What it does |
| --- | --- | --- | --- |
| Home | `#/` | everyone | Overview with the photo banner and a preview of the outputs |
| Screen | `#/screen` | signed in | Upload a scan, enter clinical values, run the analysis, make a PDF |
| My reports / Patients | `#/reports` | signed in | Patients: screenings, PDF reports, doctor directory, and access-request approval. Doctors: request access by patient email and review approved patients' saved results |
| Result | `#/reports/<id>` | signed in | One saved result with its PDF reports |
| Sign in | `#/sign-in` | everyone | Sign in or create an account, both confirmed by an emailed code |
| About PCOS | `#/about` | everyone | What PCOS is and how it is diagnosed, with sources |
| How it works | `#/how-it-works` | everyone | The pipeline, an example result, and the limits |

It uses a small hash router, so the built site works from any static host without server setup.

## How it talks to the backend

Everything goes through `src/lib/api.js`. Sessions are kept in `localStorage` (`pcos.session`); an expired access token is renewed once with the refresh token before the user is signed out.

| Action | Call |
| --- | --- |
| Create account | `POST /api/auth/register`, then `POST /api/auth/verify-registration` |
| Sign in | `POST /api/auth/login`, then `POST /api/auth/verify-login` (an unverified account is sent to registration verification instead) |
| Run a screening | `POST /api/analysis/run`, multipart: `clinical_json` (JSON text) and optional `ultrasound` image file |
| History | `GET /api/analysis/history` (patients), `GET /api/analysis/doctor-history` (doctors), `GET /api/analysis/{id}` |
| PDF report | `POST /api/reports/{analysis_id}/generate`, `GET /api/reports`, `POST /api/reports/{id}/download/request`, then `POST /api/reports/{id}/download/verify?otp=...` |
| Doctor sharing | Patients select a doctor from `GET /api/users/available-doctors` and send a request using `POST /api/users/patient-access-requests`. Doctors can request one patient using their email with `POST /api/users/doctor-access-requests`; the patient must approve. Both sides see/respond to requests through `GET /api/users/access-requests` and `POST /api/users/access-requests/{request_id}/respond`. Active access can be revoked by either party. |
| Follow-up plans | Doctors read/update a patient plan with `GET`/`PUT /api/users/doctor-patients/{patient_id}/care-plan`; patients read their own shared plans with `GET /api/users/patient-care-plans`. Notes are visible to the patient. |
| Doctor summary | `GET /api/users/doctor-dashboard-summary` returns counts only for currently authorized patients. |

Errors use FastAPI's `{ "detail": ... }` and are shown as written. If the server cannot be reached, the message names the address and mentions CORS.

### The clinical form

`src/lib/features.js` lists the 38 inputs the form asks for, with the API key and model column name for each. BMI, FSH/LH and waist:hip ratio are not asked for, because the server works them out. Blank fields are left out of `clinical_json`, so the server's defaults apply. The sanity ranges (`min`/`max`) only catch typing slips, since the backend checks none. Edit that one file if the model's columns change.

Yes/No answers are sent as `true`/`false`. If the backend answers `422 Invalid clinical data` for them, set `YES_NO_FORMAT = 'string'` in `src/config.js`.

### The results

`src/lib/results.js` reads `clinical`, `ultrasound`, `combined` and `explainability` from the response. The screens show only what the backend returns:

- each available model probability and the combined model label (PCOS at 50% or above), with a band for results near the threshold;
- the Random Forest's overall feature importances next to the values the model was given, marked "default" where the server filled a value in;
- any plain text the backend puts directly under `explainability` (for example from `build_explanation()`).

There is no heatmap or weight slider; the backend fixes multimodal weights at 50/50.

## Things to confirm

- **Blood group codes** (`BLOOD_GROUPS` in `features.js`) follow the public Kaggle PCOS dataset (11 = A+ ... 18 = AB−). Check them against your training data.
- **Cycle length** is labelled with a note that the training data looks like days of bleeding (mostly 2 to 12). Confirm and rename the label if needed.
- **The 35% and 65% band edges** in `config.js` are a display aid, not a clinical rule.
- `MIN_CLINICAL_FIELDS` (8) only decides when the result page warns that the clinical numbers mostly reflect defaults.

## Notes on the backend

Current behavior and remaining considerations:

- The API returns `NOT_AVAILABLE` for the clinical modality unless all 38 form values are present (with BMI and two ratios computed from source values). Without an image, ultrasound is `NOT_AVAILABLE`. Fusion uses only modalities that produced a probability.
- Doctors can view all saved reports belonging to a patient only after the access request is approved. Either person can revoke access; revocation blocks subsequent doctor API access.
- The patient dashboard lists registered doctor accounts, but this prototype does not verify professional credentials. Doctor-initiated requests require a patient email; it does not expose a directory of patient names.
- Patients can also revoke access. Revocation is enforced by the backend for saved analyses, reports, assistant context, dashboard data, and doctor follow-up editing.
- Doctor accounts can still self-register in this prototype; patient sharing is the data-access boundary, not professional credential verification.
- Clinician notes and follow-up dates/status are shared with the patient. Each doctor's plan is separate, and the patient can continue to view their own plan after access is revoked.
- The dashboard highlights unavailable modalities, incomplete clinical inputs, and estimates in the 35%-65% display band. This band is a UI review aid, not a clinical rule.
- The active analysis route returns a Grad-CAM++ heatmap overlay for ultrasound images; the older `ultrasound_model.explain()` helper is not used by that route.
- Uploaded images and PDFs are stored on the server's disk. They contain health data, so consider access controls and retention.

## Pictures

Each page has its own photo in `public/images/`:

| Page | File |
| --- | --- |
| Home | `consultation.jpg` |
| Screen | `screen.jpg` |
| About PCOS | `about.jpg` |
| How it works | `how.jpg` |
| Sign in | `signin.jpg` |

The crop and zoom of each one is set in `src/content/images.js`. To use another photo, replace the file (3:2 landscape, 1920 px wide or more, subject on the right with calm space on the left, no readable text or logos) and adjust its crop there. Only use images you have the right to publish.

The photographs are AI-generated, and the footer says so. Some carry a small generator mark in a corner. It is left as it came, and some pages crop it out as part of the layout. If you replace the photos, keep the footer note accurate.

The small ultrasound pictures on Home, About and How it works are synthetic images drawn in the browser (`src/lib/synthetic.js`), and the page says so. Replace them by setting `src` for `example`, `typical` or `pcom` in `src/content/images.js`. Clinical scans need consent or proper de-identification before they are published.

## Project layout

```
src/
  config.js            names, API address, upload limits, bands
  lib/                 api.js, auth.jsx, features.js, results.js, router.jsx, format.js, synthetic.js
  pages/               Home, Screen, Reports, ReportDetail, SignIn, About, How
  components/          Header, PageHero, ClinicalForm, ReportView, ReportActions, ReportDownload, ...
  content/             images.js, sample.js (fixed example output for Home and How it works)
public/images/         consultation.jpg
```

## Accessibility

Skip link, visible focus, labelled fields, errors announced with `role="alert"`, results in a live region, colour never the only signal (band names are written out), and reduced-motion support.

This is a research prototype. The outputs are model estimates and not a diagnosis.
