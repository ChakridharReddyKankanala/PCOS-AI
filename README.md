# PCOS-AI: Explainable Multimodal Screening Platform

A full-stack clinical research and AI screening platform for Polycystic Ovary Syndrome (PCOS). The system combines tabular clinical/biomarker data with ultrasound imaging using decision-level fusion and explainable AI (SHAP and Grad-CAM++).

---

## Architecture Overview

```
+-----------------------------------+     +-----------------------------------+
|      Clinical & Lab Biomarkers    |     |      Ultrasound Scan Image        |
|  (41 features: AMH, LH/FSH, BMI)  |     |   (224x224 RGB Normalized Scan)   |
+-----------------+-----------------+     +-----------------+-----------------+
                  |                                         |
                  v                                         v
   +-----------------------------+           +-----------------------------+
   |   Random Forest Classifier  |           | EfficientNet-B0 + Attention |
   |  (700 Trees, 90.8% Test Acc)|           |  (Gated Attention Pooling)  |
   +--------------+--------------+           +--------------+--------------+
                  |                                         |
                  +--------------------+--------------------+
                                       |
                                       v
                        +------------------------------+
                        |      Late Fusion Engine      |
                        | (Dual-Modal Weighted Average)|
                        +--------------+---------------+
                                       |
                                       v
                 +--------------------------------------------+
                 |    Prediction & Explainability (XAI)       |
                 | - Probability & Confidence Score           |
                 | - SHAP Local Biomarker Contributions       |
                 | - Grad-CAM++ Saliency Heatmap Overlay      |
                 +--------------------------------------------+
```

### Models & Metrics
* **Clinical Model:** Scikit-Learn `RandomForestClassifier` trained on 41 clinical parameters.
  * **Holdout Test Accuracy:** 90.83%
  * **ROC-AUC:** 0.9486
  * **Specificity:** 98.63%
  * **Sensitivity / Recall:** 75.00%
  * **Explainability:** SHAP (`TreeExplainer`) per-patient feature attribution.
* **Ultrasound Model:** PyTorch `EfficientNet-B0` with gated spatial attention pooling.
  * **Explainability:** Grad-CAM++ activation heatmaps highlighting follicle clusters and ovarian morphology.
* **Multimodal Fusion:** Late fusion via equal-weight probability average ($0.5 \times P_{\text{clinical}} + 0.5 \times P_{\text{ultrasound}}$) with automatic graceful single-modality fallback.

---

## Quickstart with Docker (Run in Any Environment)

The easiest way to run the entire system (Frontend, Backend, and MongoDB) without installing Python or Node.js locally is using **Docker Compose**:

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

### Run
```bash
docker compose up --build
```

* **Frontend:** Open `http://localhost:5173`
* **FastAPI Backend & Docs:** Open `http://localhost:8000/docs`
* **MongoDB:** Running on `localhost:27017`

To shut down:
```bash
docker compose down
```

---

## Manual Local Setup

### 1. Backend Setup
1. **Prerequisites:** Python 3.10 – 3.12, MongoDB (optional; defaults to in-memory mock if not running).
2. **Navigate & Install:**
   ```bash
   cd backend
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # macOS/Linux:
   source .venv/bin/activate

   pip install -r requirements.txt
   ```
3. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```
4. **Start Backend:**
   ```bash
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
   Interactive API documentation available at `http://127.0.0.1:8000/docs`.

---

### 2. Frontend Setup
1. **Prerequisites:** Node.js 18+ or 20+.
2. **Navigate & Install:**
   ```bash
   cd frontend
   npm install
   ```
3. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```
4. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## Security & Privacy Notice
* Model outputs are intended as decision-support research estimates and do not replace professional clinical diagnosis.
* Sensitive credential files (`.env`) and patient health records are excluded from git version control.
