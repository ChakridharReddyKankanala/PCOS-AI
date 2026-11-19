# PCOS-XAI Codebase Learning Guide

This guide explains the handwritten backend and other non-frontend project files. It intentionally does not walk through `frontend/`. The goal is to explain what the code does, how a request moves through it, and which files are data or generated output rather than executable source.

## 1. Big Picture

The backend is a FastAPI application. It accepts HTTP requests, validates input, calls the clinical and ultrasound model adapters, combines any available probabilities, creates explanations, and saves results in MongoDB. Authentication, email OTPs, report PDFs, and patient-to-doctor access codes are also implemented here.

The main analysis request follows this path:

1. `backend/app/main.py` creates the FastAPI app and mounts route modules.
2. `backend/app/api/analysis.py::run_analysis` checks the access token, parses clinical form data, and optionally saves an uploaded image.
3. `backend/app/ml/clinical_model.py::ClinicalModel.predict` converts clinical fields to the feature layout expected by the saved Random Forest and predicts a probability.
4. `backend/app/ml/ultrasound_model.py::UltrasoundModel.predict` preprocesses an image and asks the EfficientNet model for a probability, if an image was provided.
5. `backend/app/ml/fusion_engine.py::FusionEngine.combine` averages both probabilities when both exist, or uses the one available probability.
6. `backend/app/explainability/service.py::build_explanation` asks `xai_pcos.py` for SHAP values and/or a Grad-CAM++ heatmap.
7. The analysis is saved in the `analyses` MongoDB collection and returned as JSON.

Authentication and report generation use other route modules, but share configuration, database, security, and OTP helpers.

## 2. Python Ideas Used Here

- `import` makes functions, classes, and libraries from another module available.
- A `class` groups data and related operations. A model adapter class, for example, owns its loaded model and its prediction methods.
- A function declared with `async def` can pause at `await` while network or database work completes. FastAPI calls these asynchronous route functions for HTTP requests.
- `await` is used for asynchronous operations, such as MongoDB calls. It is not needed for ordinary local computations.
- A decorator such as `@router.post(...)` registers a Python function as an HTTP endpoint.
- `Depends(...)` tells FastAPI to run a dependency first, such as loading the signed-in user, then pass its result into the route.
- `raise HTTPException(...)` stops the request and sends an HTTP error response.
- `None` means “no value.” The model adapters use it when a model probability is unavailable.
- `try/except` catches an error so the code can return a controlled response or use a fallback. It can also hide a defect if the exception is only logged; read the fallback behavior for each function.
- A dictionary such as `{"prediction": "PCOS", "probability": 0.8}` is the common data format passed between backend layers and returned as JSON.
- `Path` builds filesystem paths in an operating-system-independent way. `uuid4()` creates a random identifier for saved analyses, reports, and uploaded filenames.

## 3. Backend Files, One by One

### Application and API routes

#### `backend/app/main.py`

This is the application entry point. Uvicorn imports `app` from this module when started with `uvicorn app.main:app` from the `backend/` folder.

- `app = FastAPI(...)` creates the application object and supplies its name, version, and description. FastAPI also uses it to generate `/docs` and `/openapi.json`.
- `app.add_middleware(CORSMiddleware, ...)` allows browser applications served from local development origins to call the API. The regex accepts localhost and 127.0.0.1 with any port; it is not a general cross-domain allow-list.
- `startup()` calls `connect_db()` before requests are served.
- `shutdown()` calls `close_db()` when the server shuts down.
- `app.include_router(...)` attaches the authentication, user, analysis, report, and health endpoints under their prefixes.
- `root()` handles `GET /` and returns the service name, a running status, and the docs path.

#### `backend/app/api/auth.py`

Each decorated function is an HTTP route. The module coordinates user creation, password checks, OTP verification, and token issuance.

- `register(data, bg)`, `POST /api/auth/register`: normalizes the email, checks whether email or phone already exists, hashes the password, stores an unverified user, creates a registration OTP, and schedules an email. It returns the new user ID, not a token.
- `verify_registration(data)`, `POST /api/auth/verify-registration`: checks the registration OTP, marks the account verified, loads the account, then returns access and refresh tokens.
- `login(data, bg)`, `POST /api/auth/login`: checks email and password. An unverified account gets another registration OTP; a verified account gets a login OTP. This route does not issue tokens yet.
- `verify_login(data)`, `POST /api/auth/verify-login`: checks the login OTP and returns access and refresh tokens for the account.
- `refresh(data)`, `POST /api/auth/refresh`: decodes a refresh token, checks its type and that the user still exists, then returns a new access token. It does not return a replacement refresh token.

The input types for these routes live in `backend/app/schemas/auth.py`. Email and password are checked against the stored user, and passwords are not stored as plain text. OTP delivery is handled by `notification_service.py`.

#### `backend/app/api/users.py`

- `me(user)`, `GET /api/users/me`: returns a small allow-list of fields for the signed-in account rather than returning the full database document.
- `create_code(user)`, `POST /api/users/patient-access-code`: only accepts a patient (enforced by `require_roles`), creates a random code, stores it as unused, and sets its expiry to 30 minutes.
- `doctor_access(code, doctor)`, `POST /api/users/doctor-access/{code}`: only accepts a doctor. It looks up an unused code, normalizes its timestamp to UTC, rejects expired codes, marks a valid code used, and returns its patient ID. The code is one-use.

#### `backend/app/api/analysis.py`

- `get_optional_user(request)`: reads a bearer access token from the request and decodes it. If it can find the associated database user, it returns that user. If the database lookup throws an exception after a token is accepted, it constructs a minimal patient-like user from the token subject. Despite its name, the analysis endpoint itself rejects a missing/invalid user.
- `run_analysis(request, clinical_json, ultrasound)`, `POST /api/analysis/run`: requires authentication; parses and validates clinical JSON; optionally validates image extension and file size; stores an uploaded image under a random name; calls both model adapters; fuses their outputs; computes explanations; saves an analysis record; and returns the result. A failed database insert is logged, but the response is still returned.
- `history(request)`, `GET /api/analysis/history`: returns the signed-in patient's saved analyses, newest first. With no recognized user it returns an empty list. Database errors become HTTP 500.
- `doctor_history(request)`, `GET /api/analysis/doctor-history`: rejects non-doctors, then lists analyses and looks up patient names for the doctor view.
- `get_analysis(analysis_id, request)`, `GET /api/analysis/{analysis_id}`: loads one saved analysis. Patients are restricted to their own records; doctors query by ID without the patient restriction. The response includes model output, clinical input, and explainability data.

Important data handling details: accepted image suffixes are JPG, JPEG, PNG, and WEBP; the configured maximum upload size defaults to 10 MB. The image bytes are written to disk before model inference. This route does not delete the uploaded image afterward.

#### `backend/app/api/reports.py`

- `generate_report(analysis_id, user)`, `POST /api/reports/{analysis_id}/generate`: finds an analysis the patient owns, or any analysis when the caller is a doctor; generates a short summary and PDF; records the report metadata; returns the report ID and status.
- `report_history(user)`, `GET /api/reports`: lists reports for the patient, or all reports for a doctor, and adds each patient's name.
- `request_download(report_id, bg, user)`, `POST /api/reports/{report_id}/download/request`: verifies the report is accessible to the caller, creates an OTP challenge specific to that report, and schedules the OTP email.
- `verify_download(report_id, otp, user)`, `POST /api/reports/{report_id}/download/verify`: repeats the access check, verifies that report-specific OTP, then streams the PDF file.

#### `backend/app/api/health.py`

- `health()`, `GET /api/health`: sends a `ping` command through the active database object and returns a healthy response if that command succeeds. The mock database responds to the same command, so this endpoint does not prove that persistent MongoDB storage is being used.

### Configuration, authentication, and database

#### `backend/app/core/config.py`

- `Settings`: a Pydantic settings class. It defines application name, MongoDB URI/database, JWT settings, OTP lifetime/attempt limit, SMTP options, report/upload folders, upload limit, and ultrasound PCOS class index. Environment variables and `backend/.env` can override defaults. `extra="ignore"` means unknown environment values are ignored.
- `settings = Settings()`: creates one settings object when the module loads; other modules import this shared object.

The in-code JWT secret is only a development default. A deployed application should provide a strong secret through the environment.

#### `backend/app/core/security.py`

- `hash_password(password)`: bcrypt-hashes a password with a newly generated salt.
- `verify_password(password, password_hash)`: checks a supplied password against the bcrypt hash.
- `create_token(subject, role, token_type, delta)`: creates a signed JWT containing user ID (`sub`), role, token type, issue time, and expiry time.
- `create_access_token(subject, role)`: creates an access token using the configured access-token lifetime.
- `create_refresh_token(subject, role)`: creates a refresh token using the configured refresh-token lifetime.
- `decode_token(token)`: verifies and decodes a JWT; returns `None` if the token is invalid, expired, or cannot be decoded.
- `generate_otp()`: returns a cryptographically random six-digit string. This helper is defined here, but the active OTP service generates its code directly instead.
- `hash_otp(otp)`: returns a SHA-256 digest of an OTP. This helper is defined here, but the active OTP service currently stores OTP values in plaintext.
- `verify_otp_hash(otp, otp_hash)`: compares a supplied OTP digest using constant-time comparison. It is also not used by the active OTP service.

#### `backend/app/core/deps.py`

- `get_current_user(credentials)`: FastAPI dependency that requires HTTP Bearer credentials, accepts only an access-type token, loads its user, adds `user_id` as a convenient alias of MongoDB `_id`, and returns the user. Invalid tokens or missing users produce HTTP 401.
- `require_roles(*roles)`: a dependency factory. It creates a `checker` dependency that first loads the current user and then returns HTTP 403 unless the user's role is allowed. Routes use it for role-limited actions.
- `bearer`: the `HTTPBearer` parser FastAPI uses to extract the Authorization header.

#### `backend/app/db/mongo.py`

This module presents a small database interface. It normally connects to MongoDB using Motor, but switches to an in-memory mock if the connection fails.

`MockCollection` is the local fallback for one collection:

- `__init__(name)`: stores the collection name and initializes an empty Python list.
- `create_index(...)`, `drop_index(...)`: no-op placeholders; the mock does not enforce indexes or uniqueness.
- `index_information()`: returns an empty dictionary.
- `insert_one(doc)`: assigns a UUID `_id` if missing, appends the document, and returns a tiny object with `inserted_id`.
- `delete_many(filter_doc)`: removes all documents whose fields match every filter key and returns a deleted count.
- `update_one(filter_doc, update_doc)`: finds the first matching document and applies the supported `$set`, `$inc`, and `$unset` operations.
- `update_many(filter_doc, update_doc)`: applies those same supported updates to all matches and returns the count.
- `find_one(filter_doc)`: returns the first document matching every filter field, or `None`.
- `find(filter_doc)`: returns an `AsyncCursor` containing matching documents. The cursor's `sort(...)` currently does nothing; `to_list(length)` returns a list; async iteration returns one item at a time.
- `AsyncCursor.__init__(items)`: stores the result list.
- `AsyncCursor.sort(...)`: returns itself without sorting.
- `AsyncCursor.to_list(length)`: returns all items or the first `length` items.
- `AsyncCursor.__aiter__()`: starts an async iteration and returns the cursor.
- `AsyncCursor.__anext__()`: returns the next item, or signals that iteration is finished.

`MockDB` and module-level functions:

- `MockDB.__init__()`: creates a dictionary that will hold mock collections.
- `MockDB.__getattr__(name)`: lazily creates and returns a `MockCollection` for a collection name such as `users` or `analyses`.
- `MockDB.command(...)`: always returns `{"ok": 1}`, allowing the mock to answer the health ping.
- `connect_db()`: creates a MongoDB client, pings it, selects the configured database, and creates indexes. It also attempts to remove old null phone fields and recreate a partial unique phone index. Any connection/setup exception logs a message and switches the active database to the in-memory mock.
- `close_db()`: closes the Motor client if one was created.
- `get_db()`: returns the current database object, or the mock if the global database value is `None`.

The mock is for development continuity, not durable storage: its data disappears when the process exits, and its cursor does not implement real sorting.

### Input schemas

#### `backend/app/schemas/analysis.py`

- `ClinicalInput`: Pydantic model for optional clinical, symptom, lab, vital, and ultrasound-structure fields. Values are mostly optional at the parsing layer; `ClinicalModel.missing_inputs` later decides whether enough required values exist to run the clinical model. `testosterone` is accepted by this schema but is not mapped into the current Random Forest feature table.

#### `backend/app/schemas/auth.py`

- `RegisterRequest`: requires a valid email, password with at least eight characters, name with at least two characters, and role `patient` or `doctor`; phone is optional.
- `VerifyOTPRequest`: user ID and exactly six OTP characters.
- `LoginRequest`: valid email and password.
- `VerifyLoginOTPRequest`: user ID and six OTP characters.
- `RefreshRequest`: refresh-token string.

These classes validate request bodies before route functions work with them. Pydantic handles parsing and raises a validation response for malformed data.

### Clinical and ultrasound models

#### `backend/app/ml/clinical_model.py`

This is an adapter around a saved scikit-learn Random Forest. It translates API field names into the training dataset's column names and order.

- `DEFAULT_FEATURE_VALUES`: fallback values used while constructing a full model row. `missing_inputs` normally prevents prediction if required fields are absent, but some optional/derived values can still use defaults.
- `REQUIRED_INPUTS`: API-side fields the clinical model expects before prediction. BMI, FSH/LH, and waist/hip ratio are allowed to be calculated from their source measurements.
- `ClinicalModel.computed_inputs`: names of those three derivable values.
- `ClinicalModel.input_aliases`: accepted alternative names for menstrual cycle, marital status, hair growth, hair loss, and pimples.
- `ClinicalModel.__init__()`: initializes model state and immediately tries to load the saved estimator.
- `ClinicalModel._load_model()`: loads `pcos_model.pkl` and, if present, `pcos_features.pkl`; otherwise it uses feature names stored on the estimator. It records a load failure rather than crashing import of the whole application.
- `ClinicalModel._map_input_to_features(clinical_data)`: starts with default training-column values, overlays supplied API values, converts yes/no-like symptom fields to numeric flags, derives BMI and ratios when necessary, then returns a one-row pandas DataFrame in the estimator's feature order.
- `ClinicalModel.prepare_features(clinical_data)`: public wrapper used by the explainability service to get the same encoded row used by prediction.
- `ClinicalModel._has_input(clinical_data, keys)`: returns whether at least one candidate field is present and non-empty.
- `ClinicalModel.missing_inputs(clinical_data)`: checks required fields and accepts the allowed aliases/derived values. It returns a list of missing field names; invalid or non-positive ratio denominators make a derived input count as missing.
- `ClinicalModel.predict(clinical_data)`: rejects incomplete data, attempts model loading if necessary, creates the feature row, gets class probabilities, selects the configured convention that probability index 1 is PCOS, applies the 0.5 threshold, and returns prediction/probability/encoded values. Exceptions become an `ERROR` result rather than escaping the route.
- `ClinicalModel.explain(clinical_data)`: legacy/global-importance fallback. It returns the model's `feature_importances_` for the top eight columns with their input values. These are overall model importances, not per-patient SHAP effects.
- `clinical_model`: one shared `ClinicalModel` instance created when this module is imported.

#### `backend/app/ml/ultrasound_model.py`

This module rebuilds the PyTorch image classifier architecture, loads its checkpoint, and handles preprocessing and predictions.

- `EfficientNetAttention.__init__()`: creates an EfficientNet-B0 feature extractor, two gated-attention layers, an attention score layer, and a small two-class classifier head.
- `EfficientNetAttention.forward(inputs)`: computes convolutional feature maps; flattens the spatial locations into a sequence; computes gated attention weights; takes an attention-weighted sum; and returns two class logits.
- `UltrasoundModel.__init__()`: initializes model/error state and calls `_load_model()`.
- `UltrasoundModel._checkpoint_stream()`: checks for the extracted checkpoint directory, then packs its files into an in-memory ZIP stream compatible with PyTorch's loader.
- `UltrasoundModel._load_model()`: loads the state dictionary on CPU, reconstructs the architecture, requires all parameter names to match, switches to inference mode, and stores any load error.
- `UltrasoundModel.preprocess_image(image_path)`: converts the image to RGB, resizes it to 224 by 224, converts pixels to a tensor, applies ImageNet channel normalization, and adds a batch dimension.
- `UltrasoundModel.predict(image_path)`: returns unavailable if there is no image or no loaded model; otherwise runs inference without gradient tracking, applies softmax, reads the configured PCOS class index, and returns the probability and label. Exceptions are returned as `ERROR` results.
- `UltrasoundModel.explain(image_path, status)`: currently returns only method/status metadata and `heatmap_path: None`; the actual Grad-CAM++ calculation is performed by `backend/app/explainability/service.py` and `xai_pcos.py` instead.
- `ultrasound_model`: one shared adapter instance created at import time.

#### `backend/app/ml/fusion_engine.py`

- `FusionEngine.combine(clinical, ultrasound)`: uses the arithmetic mean when both probabilities exist, passes through the available probability when only one exists, and returns unavailable when neither exists. It applies a 0.5 decision threshold and defines the confidence score as the larger class probability expressed as a percentage. This is not a calibrated confidence interval.
- `fusion_engine`: one shared fusion object.

### Explainability

#### `backend/app/explainability/service.py`

This is the backend-facing adapter around `xai_pcos.py`. It builds the expensive explainers lazily and keeps them in a process-local cache.

- `_ExplainerCache`: holds the clinical and image explainer objects along with the model instances they belong to.
- `_load_xai_module()`: adds the project root to Python's import path if needed, then imports the root-level `xai_pcos.py` module.
- `_get_clinical_explainer(model)`: returns a cached SHAP explainer if it belongs to the same model. Otherwise loads the clinical CSV, aligns and cleans the background rows to the trained feature names, and creates a `ClinicalExplainer`.
- `_get_image_explainer(model)`: returns or builds a `TorchGradCAMPlusPlus` object for the current image model and configured PCOS output index.
- `build_explanation(...)`: reports clinical SHAP when clinical prediction succeeded; if SHAP construction fails, it calls the legacy global-importance method and labels that fallback. If an image was supplied, it calculates a Grad-CAM++ overlay or reports the relevant error/unavailable state. When both explanation probabilities exist, it also adds an equal-weight fusion breakdown. Explanations describe the model, not medical causation.

#### Root `xai_pcos.py`

This file contains reusable explanation algorithms, independent of FastAPI. The backend currently uses `ClinicalExplainer`, `TorchGradCAMPlusPlus`, and `explain_image`; the Keras variant, combined helper, and deletion test are general utilities and are not part of the active request route.

Clinical SHAP:

- `_positive_class_shap(sv, positive_class_index)`: normalizes SHAP's different return formats and selects values for the positive class.
- `ClinicalExplainer.__init__(model, feature_names, medians, background_df)`: stores the classifier/features/medians, finds which class index means positive, builds a SHAP `TreeExplainer`, and saves its expected/base value. If a background frame is supplied, it cleans it and limits it to 100 randomly selected rows for explainer construction.
- `ClinicalExplainer.from_model(model, background_df)`: class factory that gets feature names from the fitted model (or background columns), computes medians, and calls the constructor.
- `ClinicalExplainer._row(patient)`: orders one patient's values to the model's feature list and fills missing values with background medians.
- `ClinicalExplainer.explain_patient(patient, top_k)`: gets the patient's positive-class probability and SHAP values, sorts features by absolute SHAP effect, and returns the top entries with raw value, signed SHAP value, direction, base rate, and an additivity gap. The additivity gap indicates how closely base value plus the feature effects reconstructs the model probability.

Grad-CAM++ internals and image methods:

- `_gradcampp_from(A, g)`: calculates Grad-CAM++ channel weights from feature-map activations and gradients, sums the weighted activations, clips negative map values, and normalizes the result to 0..1.
- `KerasGradCAMPlusPlus.__init__(...)`: configures a Keras model, identifies a spatial feature layer, and builds a model/forward chain that exposes feature activations and output predictions.
- `KerasGradCAMPlusPlus._forward(x)`: runs the model while returning both the chosen spatial activations and predictions.
- `KerasGradCAMPlusPlus._find_spatial_layer(model)`: searches backward for a layer with a four-dimensional spatial output.
- `KerasGradCAMPlusPlus._out_index(class_index)`: maps the app's class meaning (PCOS or not PCOS) to the model's output column.
- `KerasGradCAMPlusPlus._score(preds, class_index)`: chooses a class score and converts probabilities to log-odds when necessary, helping gradients remain useful near extreme probabilities.
- `KerasGradCAMPlusPlus._p_pcos(preds)`: converts model outputs into a PCOS probability.
- `KerasGradCAMPlusPlus.heatmap(x, class_index)`: records gradients for the selected class, creates the CAM, and returns the map, PCOS probability, and explained class.
- `TorchGradCAMPlusPlus.__init__(...)`: sets a PyTorch model to evaluation mode and registers a forward hook on the target feature layer to capture activations.
- `TorchGradCAMPlusPlus._out_index(class_index)`: maps PCOS/normal meaning to the model output index.
- `TorchGradCAMPlusPlus._logit(out, class_index)`: obtains the chosen class's score and converts probability outputs to log-odds when needed.
- `TorchGradCAMPlusPlus._p_pcos(out)`: applies sigmoid or softmax as needed and returns the PCOS probability.
- `TorchGradCAMPlusPlus.heatmap(x, class_index)`: runs the model with gradients enabled, chooses the predicted class when none is specified, differentiates its score with respect to captured activations, and returns a normalized map and class probability.
- `overlay_heatmap(rgb_uint8, cam, alpha)`: resizes the CAM to image dimensions, colors it, and blends it over the original image.
- `_png_b64(rgb_uint8)`: encodes an RGB array as PNG and returns base64 text suitable for JSON transport.
- `explain_image(image_explainer, x, rgb_uint8, class_index)`: optionally downsizes very large display images, gets a CAM, creates the overlay, and returns a JSON-ready base64 image plus the most active location and area summary.
- `explain_case(...)`: convenience function that combines clinical SHAP and image Grad-CAM results and computes exact contributions for a simple average of the two probabilities. The active FastAPI route constructs its own explanation payload instead.
- `cam_deletion_test(predict_fn, images, cams, fractions, seed)`: evaluates heatmap faithfulness by replacing the most salient pixels with image-mean pixels and comparing confidence drops with random pixel replacement. This is an experiment/evaluation helper, not run automatically during analysis.

### Reports and messaging

#### `backend/app/reporting/llm_service.py`

- `generate_clinical_summary(analysis)`: returns a short fixed-format sentence containing the combined prediction and probability plus a non-diagnosis disclaimer. Despite the module name, this function does not call a language model or any external LLM service.

#### `backend/app/reporting/pdf_generator.py`

- `generate_pdf(path, patient, analysis, summary)`: creates the output directory, constructs an A4 PDF with patient identity fields, string representations of clinical/ultrasound/combined/explainability dictionaries, the fixed summary, and a medical disclaimer. It is a basic generated report, not a structured interpretation of each field.

#### `backend/app/services/notification_service.py`

- `send_otp_email(to_email, otp, purpose)`: prints a development log; if SMTP host is blank, prints a development email instead. Otherwise builds a plain-text email and sends via SSL for port 465 or STARTTLS for other ports. SMTP failures are printed and swallowed, so an API request can complete even if email delivery fails.

#### `backend/app/services/otp_service.py`

- `create_otp_challenge(user_id, purpose)`: creates a six-digit code, computes an expiry time, deletes an older challenge for that user/purpose, stores the new challenge and attempt count, prints the code for development, and returns it for email dispatch.
- `verify_otp_challenge(user_id, purpose, otp)`: finds the matching challenge, rejects missing/expired/exhausted challenges, increments failed attempts, and marks a correct challenge verified. It returns `True` or `False`.

Current implementation note: the OTP document stores the code in plaintext and logs the code. The secure hash helpers in `core/security.py` are not currently used here; this is appropriate only for local development, not production.

### Empty package initializers

These files contain no functions or statements. They mark directories as Python packages for import structure; they do not implement application behavior:

- `backend/app/__init__.py`
- `backend/app/api/__init__.py`
- `backend/app/core/__init__.py`
- `backend/app/db/__init__.py`
- `backend/app/explainability/__init__.py`
- `backend/app/ml/__init__.py`
- `backend/app/reporting/__init__.py`
- `backend/app/schemas/__init__.py`
- `backend/app/services/__init__.py`

## 4. Other Non-Frontend Project Files

#### `backend/requirements.txt`

Pins the Python dependencies: FastAPI/Uvicorn for HTTP serving; Motor for async MongoDB; Pydantic settings and multipart parsing for configuration/forms; jose and bcrypt for tokens/passwords; ReportLab for PDFs; Pillow, NumPy, pandas, scikit-learn, joblib, SHAP, OpenCV, PyTorch, and torchvision for model loading, preprocessing, predictions, and explanations; python-dotenv for `.env` support.

#### `backend/.env.example`

Template for local settings. Each variable mirrors `Settings`: database URL/name, JWT secret/algorithm/lifetimes, OTP lifetime/attempts, SMTP connection/sender fields, report/upload directories, upload size limit, and the output index representing PCOS. Copying it to `.env` gives developers a starting point. The actual `backend/.env` is deliberately not read or reproduced here because it may contain secrets.

#### `backend/.gitignore`

Excludes `.env`, Python caches, uploaded/generated files, model weights, virtual environments, and IDE settings from Git. This prevents local secrets, large artifacts, and generated data from being committed accidentally.

#### `backend/README.md`

Backend overview, required setup, run command, endpoint list, model notes, and production-hardening reminders. It is an orientation document, not the source of the route behavior.

#### `BACKEND_SPEC.md`

Detailed API/specification notes and recorded local checks. It includes endpoint request/response descriptions, example commands, model details, and known unknowns. Its own header dates some content to 2026-10-11/12 and warns that older endpoint/model notes may not match the active code, so the Python source is the authority when they disagree.

#### `make_project_digest.py`

A standalone, standard-library project inventory/export script. It reads a project tree and writes one or more `project_digest_XX.md` files into the current working directory. It is unrelated to serving the PCOS backend.

- `human(n)`: formats a byte count using B, KB, MB, or GB.
- `_redact_match(m)`: replaces matched secret-looking values with `***REDACTED***`, except harmless numeric/boolean/null values.
- `redact(text)`: applies the secret-pattern replacement to text.
- `looks_binary(path)`: reads a small byte sample and checks for null bytes; unreadable files count as binary.
- `clip(line)`: strips line endings and truncates unusually long lines.
- `classify(p, size)`: classifies a file as secret, skipped, model, image, table, notebook, text, or binary based on its name/extension/content.
- `render_text(p, rel)`: reads and redacts a text file, truncating large files and long lines for digest size limits.
- `render_notebook(p, rel)`: parses notebook JSON and renders cell source plus short text outputs; embedded images are omitted.
- `render_table(p, rel)`: reads a CSV/TSV and reports headers, row count, and a small sample. Its nested `cells(row)` formats a row for display and truncates long fields.
- `main()`: walks the requested root, skips dependency/cache directories, summarizes file kinds and folders, renders readable content, splits output into bounded chunks, and writes the digest markdown files.
- The `if __name__ == "__main__"` block calls `main()` only when this script is run directly, not when imported.

#### `project_digest_01.md`

A generated snapshot of the project tree and selected file contents. It is not application source, may become stale as files change, and should not be treated as a canonical spec. It includes a frontend inventory; this learning guide intentionally does not explain frontend files.

#### `backend/model_weights/clinical/Untitled.ipynb`

The notebook currently contains two nearly duplicated versions of a Python script that loads the saved clinical model and feature list, cleans the PCOS CSV, recreates a stratified 80/20 train/test split, and prints accuracy, sensitivity, specificity, and AUC. The second version includes `find_csv()` to locate the 541-row dataset when run in a notebook. A third cell is blank. Notebook metadata says its cells have not been executed in the current notebook state. These cells check a saved model; they do not train the model used by the running backend.

#### Data and generated artifacts

- `backend/model_weights/clinical/PCOS_data.csv`: tabular data used as SHAP's background dataset and by the notebook's model-checking code. It is data, not Python source.
- `backend/model_weights/clinical/pcos_model.pkl`: serialized scikit-learn clinical estimator loaded by `ClinicalModel`.
- `backend/model_weights/clinical/pcos_features.pkl`: serialized feature-name/order list for the clinical estimator.
- `backend/pcos_efficientnet_b0.pt/pcos_efficientnet_b0/`: PyTorch checkpoint files containing model parameters. They are loaded by `UltrasoundModel`; the individual numbered files are not handwritten source code.
- `backend/uploads/`: user-uploaded ultrasound images saved by the analysis route.
- `backend/generated_reports/`: generated PDF reports.

The model binaries cannot be explained line-by-line like Python source. Their runtime role is to provide learned parameter values to the model architectures.

## 5. Concepts and Important Limits

- **Clinical model vs. SHAP:** the Random Forest predicts from a row of numeric features. SHAP explains how those features move this model's estimate relative to a baseline. If SHAP setup fails, the code falls back to overall Random Forest feature importance, which is not a patient-specific explanation.
- **Ultrasound model vs. Grad-CAM++:** the classifier predicts from a normalized image tensor. Grad-CAM++ uses gradients and internal feature maps to highlight image regions associated with the selected class; it is not a segmentation or proof of pathology.
- **Fusion:** averaging two probabilities is simple and explicit, but equal weighting is not evidence that the two models are equally accurate or calibrated.
- **Fallback database:** startup intentionally continues if MongoDB cannot be reached, using the in-memory mock. Results in that mode disappear after process exit, and mock sorting/indexes are not real database behavior.
- **Development credentials and OTPs:** use a strong environment-provided JWT secret and proper email delivery outside development. OTP values are presently logged/stored in plaintext. SMTP errors are not propagated to the caller.
- **Clinical safety:** outputs are model estimates for research/support only. The code itself warns they are not diagnoses; it does not implement clinical validation, calibration, or a treatment recommendation system.
- **Notebook metrics:** metrics printed by the notebook are not automatically proof of clinical validity. They depend on the dataset, saved model, class order, split, and preprocessing matching the active runtime.

## 6. A Good Learning Order

1. Read `backend/app/main.py` to understand how the app starts and routes are mounted.
2. Read `backend/app/api/analysis.py` and follow one request through prediction, fusion, explanation, persistence, and response.
3. Read `backend/app/ml/clinical_model.py`, `backend/app/ml/ultrasound_model.py`, then `backend/app/ml/fusion_engine.py` to understand the prediction steps.
4. Read `backend/app/explainability/service.py` and then the relevant classes/functions in `xai_pcos.py`.
5. Read `backend/app/core/security.py`, `backend/app/core/deps.py`, `backend/app/services/otp_service.py`, and `backend/app/api/auth.py` for login and protected routes.
6. Finish with users/reports routes, schemas, configuration, and database behavior.

Use the `/docs` page on a running backend to see the HTTP request/response shapes. The code comments here are educational notes; the source files remain the executable truth.