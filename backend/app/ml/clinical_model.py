import joblib
import pandas as pd
import numpy as np
from pathlib import Path

MODEL_PATH = Path(__file__).resolve().parent.parent.parent / "model_weights" / "clinical" / "pcos_model.pkl"
FEATURES_PATH = MODEL_PATH.parent / "pcos_features.pkl"

DEFAULT_FEATURE_VALUES = {
    'Age (yrs)': 27.0,
    'Weight (Kg)': 60.0,
    'Height(Cm)': 162.0,
    'BMI': 22.8,
    'Blood Group': 11.0,
    'Pulse rate(bpm)': 72.0,
    'RR (breaths/min)': 18.0,
    'Hb(g/dl)': 12.5,
    'Cycle(R/I)': 2.0,  # 2: regular, 4: irregular
    'Cycle length(days)': 5.0,
    'Marraige Status (Yrs)': 3.0,
    'Pregnant(Y/N)': 0.0,
    'No. of abortions': 0.0,
    'I   beta-HCG(mIU/mL)': 1.99,
    'II    beta-HCG(mIU/mL)': 1.99,
    'FSH(mIU/mL)': 5.5,
    'LH(mIU/mL)': 4.2,
    'FSH/LH': 1.3,
    'Hip(inch)': 36.0,
    'Waist(inch)': 30.0,
    'Waist:Hip Ratio': 0.83,
    'TSH (mIU/L)': 2.5,
    'AMH(ng/mL)': 3.5,
    'PRL(ng/mL)': 18.0,
    'Vit D3 (ng/mL)': 25.0,
    'PRG(ng/mL)': 0.5,
    'RBS(mg/dl)': 95.0,
    'Weight gain(Y/N)': 0.0,
    'hair growth(Y/N)': 0.0,
    'Skin darkening (Y/N)': 0.0,
    'Hair loss(Y/N)': 0.0,
    'Pimples(Y/N)': 0.0,
    'Fast food (Y/N)': 0.0,
    'Reg.Exercise(Y/N)': 1.0,
    'BP _Systolic (mmHg)': 120.0,
    'BP _Diastolic (mmHg)': 80.0,
    'Follicle No. (L)': 4.0,
    'Follicle No. (R)': 4.0,
    'Avg. F size (L) (mm)': 15.0,
    'Avg. F size (R) (mm)': 15.0,
    'Endometrium (mm)': 7.5
}

REQUIRED_INPUTS = (
    "age", "weight", "height", "bmi", "blood_group", "pulse_rate", "respiratory_rate", "hb", "cycle", "cycle_length",
    "marriage_status_years", "pregnant", "abortions", "beta_hcg_1", "beta_hcg_2", "fsh", "lh", "fsh_lh",
    "hip", "waist", "waist_hip_ratio", "tsh", "amh", "prolactin", "vitamin_d3", "progesterone", "rbs",
    "weight_gain", "hair_growth", "skin_darkening", "hair_loss", "pimples", "fast_food", "regular_exercise",
    "bp_systolic", "bp_diastolic", "follicle_no_left", "follicle_no_right", "average_follicle_size_left",
    "average_follicle_size_right", "endometrium",
)

class ClinicalModel:
    model_version = "RandomForest-Clinical-v1"
    computed_inputs = {"bmi", "fsh_lh", "waist_hip_ratio"}
    input_aliases = {
        "cycle": ("cycle", "irregular_cycles", "irregularPeriods"),
        "marriage_status_years": ("marriage_status_years", "maritalStatus"),
        "hair_growth": ("hair_growth", "excessiveHair"),
        "hair_loss": ("hair_loss", "hairLoss"),
        "pimples": ("pimples", "acne"),
    }

    def __init__(self):
        self.model = None
        self.feature_names = None
        self._load_model()

    def _load_model(self):
        try:
            if MODEL_PATH.exists():
                self.model = joblib.load(MODEL_PATH)
                if FEATURES_PATH.exists():
                    saved_features = joblib.load(FEATURES_PATH)
                    if isinstance(saved_features, list):
                        self.feature_names = saved_features
                if self.feature_names is None and hasattr(self.model, "feature_names_in_"):
                    self.feature_names = list(self.model.feature_names_in_)
                print(f"[ClinicalModel] Successfully loaded model from {MODEL_PATH}")
            else:
                print(f"[ClinicalModel] Model file not found at {MODEL_PATH}")
        except Exception as e:
            print(f"[ClinicalModel] Error loading model: {e}")
            self.model = None

    def _map_input_to_features(self, clinical_data: dict) -> pd.DataFrame:
        features = DEFAULT_FEATURE_VALUES.copy()
        
        if not clinical_data:
            clinical_data = {}

        # Basic Info
        if clinical_data.get("age") is not None: features['Age (yrs)'] = float(clinical_data["age"])
        if clinical_data.get("weight") is not None: features['Weight (Kg)'] = float(clinical_data["weight"])
        if clinical_data.get("height") is not None: features['Height(Cm)'] = float(clinical_data["height"])
        
        # Match the notebook: use the entered BMI, with calculation only as a fallback.
        if clinical_data.get("bmi") is not None:
            features['BMI'] = float(clinical_data["bmi"])
        elif clinical_data.get("height") and clinical_data.get("weight"):
            h_m = float(clinical_data["height"]) / 100.0
            if h_m > 0:
                features['BMI'] = float(clinical_data["weight"]) / (h_m * h_m)

        if clinical_data.get("blood_group") is not None: features['Blood Group'] = float(clinical_data["blood_group"])
        if clinical_data.get("pulse_rate") is not None: features['Pulse rate(bpm)'] = float(clinical_data["pulse_rate"])
        if clinical_data.get("respiratory_rate") is not None: features['RR (breaths/min)'] = float(clinical_data["respiratory_rate"])
        if clinical_data.get("hb") is not None: features['Hb(g/dl)'] = float(clinical_data["hb"])

        # Menstrual / Clinical
        if clinical_data.get("cycle_length") is not None: features['Cycle length(days)'] = float(clinical_data["cycle_length"])
        
        # Irregular periods boolean / string
        irreg = clinical_data.get("irregular_cycles") or clinical_data.get("cycle") or clinical_data.get("irregularPeriods")
        if irreg is not None:
            if isinstance(irreg, str):
                features['Cycle(R/I)'] = 4.0 if irreg.lower() == "yes" or irreg.lower() == "irregular" else 2.0
            else:
                features['Cycle(R/I)'] = 4.0 if bool(irreg) else 2.0

        if clinical_data.get("marriage_status_years") is not None:
            features['Marraige Status (Yrs)'] = float(clinical_data["marriage_status_years"])
        elif clinical_data.get("maritalStatus") is not None:
            features['Marraige Status (Yrs)'] = 3.0 if str(clinical_data["maritalStatus"]).lower() == "married" else 0.0

        if clinical_data.get("pregnant") is not None: features['Pregnant(Y/N)'] = 1.0 if bool(clinical_data["pregnant"]) else 0.0
        if clinical_data.get("abortions") is not None: features['No. of abortions'] = float(clinical_data["abortions"])
        if clinical_data.get("beta_hcg_1") is not None: features['I   beta-HCG(mIU/mL)'] = float(clinical_data["beta_hcg_1"])
        if clinical_data.get("beta_hcg_2") is not None: features['II    beta-HCG(mIU/mL)'] = float(clinical_data["beta_hcg_2"])

        # Hormonal
        if clinical_data.get("prolactin") is not None: features['PRL(ng/mL)'] = float(clinical_data["prolactin"])
        if clinical_data.get("lh") is not None: features['LH(mIU/mL)'] = float(clinical_data["lh"])
        if clinical_data.get("fsh") is not None: features['FSH(mIU/mL)'] = float(clinical_data["fsh"])
        if clinical_data.get("fsh_lh") is not None: features['FSH/LH'] = float(clinical_data["fsh_lh"])
        elif features['FSH(mIU/mL)'] and features['LH(mIU/mL)'] and features['LH(mIU/mL)'] > 0:
            features['FSH/LH'] = features['FSH(mIU/mL)'] / features['LH(mIU/mL)']
            
        if clinical_data.get("amh") is not None: features['AMH(ng/mL)'] = float(clinical_data["amh"])
        if clinical_data.get("tsh") is not None: features['TSH (mIU/L)'] = float(clinical_data["tsh"])
        if clinical_data.get("vitamin_d3") is not None: features['Vit D3 (ng/mL)'] = float(clinical_data["vitamin_d3"])
        if clinical_data.get("progesterone") is not None: features['PRG(ng/mL)'] = float(clinical_data["progesterone"])
        if clinical_data.get("rbs") is not None: features['RBS(mg/dl)'] = float(clinical_data["rbs"])

        # Symptoms
        def to_binary(val):
            if val is None: return 0.0
            if isinstance(val, str): return 1.0 if val.lower() in ["yes", "true", "1"] else 0.0
            return 1.0 if bool(val) else 0.0

        if "weight_gain" in clinical_data: features['Weight gain(Y/N)'] = to_binary(clinical_data["weight_gain"])
        if "hair_growth" in clinical_data or "excessiveHair" in clinical_data:
            features['hair growth(Y/N)'] = to_binary(clinical_data.get("hair_growth") or clinical_data.get("excessiveHair"))
        if "skin_darkening" in clinical_data: features['Skin darkening (Y/N)'] = to_binary(clinical_data["skin_darkening"])
        if "hair_loss" in clinical_data or "hairLoss" in clinical_data:
            features['Hair loss(Y/N)'] = to_binary(clinical_data.get("hair_loss") or clinical_data.get("hairLoss"))
        if "pimples" in clinical_data or "acne" in clinical_data:
            features['Pimples(Y/N)'] = to_binary(clinical_data.get("pimples") or clinical_data.get("acne"))
        if "fast_food" in clinical_data: features['Fast food (Y/N)'] = to_binary(clinical_data["fast_food"])
        if "regular_exercise" in clinical_data: features['Reg.Exercise(Y/N)'] = to_binary(clinical_data["regular_exercise"])
        if clinical_data.get("bp_systolic") is not None: features['BP _Systolic (mmHg)'] = float(clinical_data["bp_systolic"])
        if clinical_data.get("bp_diastolic") is not None: features['BP _Diastolic (mmHg)'] = float(clinical_data["bp_diastolic"])

        if clinical_data.get("hip") is not None: features['Hip(inch)'] = float(clinical_data["hip"])
        if clinical_data.get("waist") is not None: features['Waist(inch)'] = float(clinical_data["waist"])
        if clinical_data.get("waist_hip_ratio") is not None:
            features['Waist:Hip Ratio'] = float(clinical_data["waist_hip_ratio"])
        elif clinical_data.get("waist") and clinical_data.get("hip"):
            features['Waist:Hip Ratio'] = float(clinical_data["waist"]) / float(clinical_data["hip"])

        # Follicle / Ultrasound tabular
        if clinical_data.get("follicle_no_left") is not None: features['Follicle No. (L)'] = float(clinical_data["follicle_no_left"])
        if clinical_data.get("follicle_no_right") is not None: features['Follicle No. (R)'] = float(clinical_data["follicle_no_right"])
        if clinical_data.get("average_follicle_size_left") is not None: features['Avg. F size (L) (mm)'] = float(clinical_data["average_follicle_size_left"])
        if clinical_data.get("average_follicle_size_right") is not None: features['Avg. F size (R) (mm)'] = float(clinical_data["average_follicle_size_right"])
        if clinical_data.get("endometrium") is not None: features['Endometrium (mm)'] = float(clinical_data["endometrium"])

        # Build DataFrame with order matching model feature_names_in_
        if self.feature_names:
            cols = self.feature_names
        elif self.model and hasattr(self.model, "feature_names_in_"):
            cols = list(self.model.feature_names_in_)
        else:
            cols = list(DEFAULT_FEATURE_VALUES.keys())

        df = pd.DataFrame([{col: features.get(col, DEFAULT_FEATURE_VALUES.get(col, 0.0)) for col in cols}])
        return df

    def prepare_features(self, clinical_data: dict) -> pd.DataFrame:
        """Return the encoded clinical input used by the model."""
        return self._map_input_to_features(clinical_data)

    @staticmethod
    def _has_input(clinical_data: dict, keys: tuple[str, ...]) -> bool:
        return any(
            clinical_data.get(key) is not None and clinical_data.get(key) != ""
            for key in keys
        )

    def missing_inputs(self, clinical_data: dict) -> list[str]:
        """List required form inputs, allowing the three derived values."""
        values = clinical_data or {}
        missing = []
        for key in REQUIRED_INPUTS:
            if key in self.computed_inputs:
                continue
            aliases = self.input_aliases.get(key, (key,))
            if not self._has_input(values, aliases):
                missing.append(key)

        derived_sources = {
            "bmi": ("weight", "height"),
            "fsh_lh": ("fsh", "lh"),
            "waist_hip_ratio": ("waist", "hip"),
        }
        for key, sources in derived_sources.items():
            if self._has_input(values, (key,)):
                continue
            if not self._has_input(values, sources):
                missing.append(key)
                continue
            denominator = sources[1]
            try:
                if float(values[denominator]) <= 0:
                    missing.append(key)
            except (KeyError, TypeError, ValueError):
                missing.append(key)
        return missing

    def predict(self, clinical_data: dict):
        missing = self.missing_inputs(clinical_data)
        if missing:
            return {
                "prediction": "NOT_AVAILABLE",
                "probability": None,
                "model_version": self.model_version,
                "message": "Clinical estimate unavailable until all required values are provided.",
                "missing_fields": missing,
            }

        if not self.model:
            self._load_model()
            if not self.model:
                return {
                    "prediction": "UNAVAILABLE",
                    "probability": None,
                    "model_version": self.model_version,
                    "message": "Clinical model is unavailable.",
                }

        try:
            df = self._map_input_to_features(clinical_data)
            probabilities = self.model.predict_proba(df)[0]
            # Random Forest output index 1 represents PCOS probability
            pcos_prob = float(probabilities[1]) if len(probabilities) > 1 else float(probabilities[0])
            pred_label = "PCOS" if pcos_prob >= 0.5 else "Normal"
            binary_inputs = {
                "Pregnant(Y/N)": "pregnant",
                "Weight gain(Y/N)": "weight_gain",
                "hair growth(Y/N)": "hair_growth",
                "Skin darkening (Y/N)": "skin_darkening",
                "Hair loss(Y/N)": "hair_loss",
                "Pimples(Y/N)": "pimples",
                "Fast food (Y/N)": "fast_food",
                "Reg.Exercise(Y/N)": "regular_exercise",
            }
            encoded_values = {}
            for column, value in df.iloc[0].items():
                encoded_value = value.item() if hasattr(value, "item") else value
                if column == "Cycle(R/I)":
                    display_label = "Irregular" if encoded_value == 4 else "Regular"
                elif column in binary_inputs:
                    display_label = "Yes" if encoded_value == 1 else "No"
                else:
                    display_label = str(encoded_value)
                encoded_values[column] = {"label": display_label, "encoded_value": encoded_value}

            return {
                "prediction": pred_label,
                "probability": round(pcos_prob, 4),
                "encoded_values": encoded_values,
                "model_version": self.model_version
            }
        except Exception as e:
            print(f"[ClinicalModel] Prediction error: {e}")
            return {"prediction": "ERROR", "probability": None, "error": str(e), "model_version": self.model_version}

    def explain(self, clinical_data: dict):
        missing = self.missing_inputs(clinical_data)
        if missing:
            return {
                "method": "SHAP",
                "feature_importance": [],
                "status": "NOT_AVAILABLE",
                "message": "Clinical explanation unavailable until all required values are provided.",
            }
        if not self.model:
            return {"method": "Feature Importance", "feature_importance": [], "status": "MODEL_NOT_CONNECTED"}

        try:
            df = self._map_input_to_features(clinical_data)
            importances = self.model.feature_importances_
            feature_names = df.columns.tolist()

            zipped = sorted(zip(feature_names, importances, df.iloc[0].values), key=lambda x: x[1], reverse=True)
            top_features = [
                {"feature": f, "importance": round(float(imp), 4), "value": float(val)}
                for f, imp, val in zipped[:8]
            ]

            return {
                "method": "RandomForest Feature Importance",
                "feature_importance": top_features,
                "status": "SUCCESS"
            }
        except Exception as e:
            return {"method": "Feature Importance", "feature_importance": [], "status": f"ERROR: {e}"}

clinical_model = ClinicalModel()
