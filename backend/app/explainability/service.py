import importlib
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

from app.core.config import settings

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class _ExplainerCache:
    clinical_explainer = None
    clinical_model = None
    image_explainer = None
    image_model = None


_cache = _ExplainerCache()


def _load_xai_module():
    project_root = str(PROJECT_ROOT)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    return importlib.import_module("xai_pcos")


def _get_clinical_explainer(model):
    if (
        _cache.clinical_explainer is not None
        and _cache.clinical_model is model
    ):
        return _cache.clinical_explainer

    feature_names = list(model.feature_names_in_)
    dataset_path = (
        PROJECT_ROOT
        / "backend"
        / "model_weights"
        / "clinical"
        / "PCOS_data.csv"
    )
    background = pd.read_csv(dataset_path)
    background.columns = [str(name).strip() for name in background.columns]
    background = background[feature_names].apply(
        pd.to_numeric, errors="coerce"
    ).dropna()
    clinical_explainer = _load_xai_module().ClinicalExplainer
    _cache.clinical_explainer = clinical_explainer.from_model(
        model, background
    )
    _cache.clinical_model = model
    return _cache.clinical_explainer


def _get_image_explainer(model):
    if _cache.image_explainer is None or _cache.image_model is not model:
        xai = _load_xai_module()
        _cache.image_explainer = xai.TorchGradCAMPlusPlus(
            model,
            from_logits=True,
            pcos_index=settings.ULTRASOUND_PCOS_CLASS_INDEX,
        )
        _cache.image_model = model
    return _cache.image_explainer


def build_explanation(
    clinical_model,
    clinical_data,
    ultrasound_model,
    image_path=None,
    clinical_result=None,
):
    clinical = {
        "method": "SHAP",
        "status": "MODEL_NOT_CONNECTED",
        "top_features": [],
        "feature_importance": [],
    }
    if clinical_result and clinical_result.get("probability") is None:
        clinical = {
            "method": "SHAP (Random Forest)",
            "status": clinical_result.get("prediction", "NOT_AVAILABLE"),
            "top_features": [],
            "feature_importance": [],
            "message": clinical_result.get(
                "message", "Clinical explanation is not available."
            ),
        }
    elif clinical_model.model is not None:
        try:
            feature_frame = clinical_model.prepare_features(clinical_data)
            result = _get_clinical_explainer(
                clinical_model.model
            ).explain_patient(feature_frame.iloc[0].to_dict())
            clinical = {
                "method": "SHAP (Random Forest)",
                "status": "SUCCESS",
                **result,
            }
        except Exception as error:
            clinical = clinical_model.explain(clinical_data)
            clinical["status"] = "FALLBACK_GLOBAL_IMPORTANCE"
            clinical["error"] = str(error)

    ultrasound = {
        "method": "Grad-CAM++",
        "status": "NOT_AVAILABLE",
    }
    if image_path:
        if ultrasound_model.model is None:
            ultrasound = {
                "method": "Grad-CAM++",
                "status": "MODEL_NOT_CONNECTED",
            }
        else:
            try:
                tensor = ultrasound_model.preprocess_image(image_path)
                with Image.open(image_path) as image:
                    rgb = np.asarray(image.convert("RGB"))
                image_result = _load_xai_module().explain_image(
                    _get_image_explainer(ultrasound_model.model),
                    tensor,
                    rgb,
                )
                ultrasound = {
                    "method": "Grad-CAM++ (EfficientNet-B0)",
                    "status": "SUCCESS",
                    **image_result,
                }
            except Exception as error:
                ultrasound = {
                    "method": "Grad-CAM++ (EfficientNet-B0)",
                    "status": "ERROR",
                    "error": str(error),
                }

    explanation = {
        "clinical": clinical,
        "ultrasound": ultrasound,
        "summary": (
            "SHAP shows per-patient clinical feature effects; Grad-CAM++ "
            "highlights image regions used by the ultrasound model. These "
            "are model explanations, not medical causation."
        ),
    }
    clinical_probability = clinical.get("probability_pcos")
    image_probability = ultrasound.get("probability_pcos")
    if clinical_probability is not None and image_probability is not None:
        explanation["fusion"] = {
            "method": "equal_weight_probability_average",
            "probability_pcos": round(
                (clinical_probability + image_probability) / 2, 4
            ),
            "clinical_contribution": round(
                (clinical_probability - 0.5) / 2, 4
            ),
            "ultrasound_contribution": round(
                (image_probability - 0.5) / 2, 4
            ),
        }
    return explanation
