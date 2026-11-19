"""Explainability for the PCOS backend (drop-in; does not retrain or change your models).

  * ClinicalExplainer    SHAP for your clinical Random Forest (per-patient JSON)
  * KerasGradCAMPlusPlus / TorchGradCAMPlusPlus
                         Grad-CAM++ for your EfficientNetB0 ultrasound model
  * explain_image        heatmap overlay (base64 PNG) + a text-friendly heatmap summary
  * explain_case         one JSON payload for the frontend (both modalities + fusion split)
  * cam_deletion_test    faithfulness check for the heatmaps (for the paper)

Quick start (Keras):
    rf   = joblib.load("rf_clinical.joblib")               # trained on a DataFrame
    cnn  = tf.keras.models.load_model("efficientnetb0.keras")
    clin = ClinicalExplainer.from_model(rf, background_df)  # background_df = training features
    img  = KerasGradCAMPlusPlus(cnn)                        # auto-finds the last spatial layer
    payload = explain_case(clin, patient_dict, img, x_batch, rgb_uint8)

`x_batch` must be exactly what you pass to `cnn.predict(...)` (shape 1xHxWx3, already
preprocessed); `rgb_uint8` is the image you want the heatmap drawn on (HxWx3, uint8).
"""
import base64

import cv2
import numpy as np
import pandas as pd
import shap


# =============================================================================== clinical (SHAP)
def _positive_class_shap(sv, positive_class_index=1):
    if isinstance(sv, list):
        return np.asarray(sv[positive_class_index])
    sv = np.asarray(sv)
    if sv.ndim == 3:
        if sv.shape[-1] > positive_class_index:
            return sv[:, :, positive_class_index]
        if sv.shape[0] > positive_class_index:
            return sv[positive_class_index]
    return sv


class ClinicalExplainer:
    """Wrap a fitted tree model (e.g. RandomForestClassifier) to return explanations as JSON."""

    def __init__(self, model, feature_names, medians, background_df=None):
        self.model = model
        self.features = list(feature_names)
        self.medians = pd.Series(medians, index=self.features, dtype=float)
        classes = list(getattr(model, "classes_", []))
        self.positive_class_index = classes.index(1) if 1 in classes else 1
        if background_df is not None:
            background = background_df[self.features].apply(pd.to_numeric, errors="coerce").dropna()
            if background.empty:
                raise ValueError("SHAP background data has no complete feature rows")
            if len(background) > 100:
                background = background.sample(100, random_state=0)
            self.explainer = shap.TreeExplainer(
                model,
                data=background,
                feature_perturbation="interventional",
                model_output="probability",
            )
        else:
            self.explainer = shap.TreeExplainer(model)
        ev = np.asarray(self.explainer.expected_value)
        self.base = float(ev[self.positive_class_index]) if ev.ndim else float(ev)

    @classmethod
    def from_model(cls, model, background_df):
        """Use when the model was trained on a DataFrame (so it knows its feature names)."""
        names = list(getattr(model, "feature_names_in_", background_df.columns))
        background = background_df[names].apply(pd.to_numeric, errors="coerce")
        return cls(model, names, background.median(), background)

    def _row(self, patient):
        s = pd.Series(patient, dtype=float).reindex(self.features)
        return s.fillna(self.medians)  # missing inputs -> training median

    def explain_patient(self, patient, top_k=8):
        row = self._row(patient)
        X = row.to_frame().T
        prob = float(self.model.predict_proba(X)[0, self.positive_class_index])
        try:
            shap_values = self.explainer.shap_values(X, check_additivity=False)
        except TypeError:
            shap_values = self.explainer.shap_values(X)
        sv = _positive_class_shap(shap_values, self.positive_class_index)[0]
        order = np.argsort(-np.abs(sv))[:top_k]
        top_features = [
            {
                "feature": self.features[j],
                "value": float(row.iloc[j]),
                "shap": round(float(sv[j]), 4),
                "direction": "raises PCOS risk" if sv[j] > 0 else "lowers PCOS risk",
            }
            for j in order
        ]
        return {
            "probability_pcos": round(prob, 4),
            "base_rate": round(self.base, 4),
            "top_features": top_features,
            "feature_importance": [
                {
                    **feature,
                    "importance": abs(feature["shap"]),
                }
                for feature in top_features
            ],
            "additivity_gap": float(abs(self.base + sv.sum() - prob)),
        }


# =============================================================================== Grad-CAM++ core
def _gradcampp_from(A, g):
    """Grad-CAM++ (Chattopadhay et al. 2018), closed form with the exponential-score
    assumption. A, g: (h, w, k) activations and d(score)/dA. Returns a map in [0, 1]."""
    g2, g3 = g ** 2, g ** 3
    sumA = A.sum(axis=(0, 1), keepdims=True)
    denom = 2.0 * g2 + sumA * g3
    denom = np.where(denom != 0.0, denom, 1.0)
    alpha = g2 / denom
    weights = (alpha * np.maximum(g, 0.0)).sum(axis=(0, 1))
    cam = np.maximum((weights * A).sum(axis=-1), 0.0)
    m = cam.max()
    return cam / m if m > 0 else cam


class KerasGradCAMPlusPlus:
    """Grad-CAM++ for a Keras/TF model. Works for flat models and for EfficientNetB0 nested
    inside Sequential/functional wrappers (it hooks the last layer that outputs a spatial map).

    The model must already be built (call model.predict once, or load a saved model).
    Pass feature_layer="top_activation" (or any layer name) to override the auto-detection.
    Set from_logits=True if the final layer has no sigmoid/softmax.

    pcos_index says which model output means PCOS. flow_from_directory orders classes
    alphabetically, so with Kaggle folders "infected"/"notinfected" PCOS is class 0:
      * 1 output unit : pcos_index=1 -> the unit is P(PCOS);  pcos_index=0 -> it is P(Not PCOS)
      * 2 output units: pcos_index = column of the PCOS class
    """

    def __init__(self, model, feature_layer=None, from_logits=False, pcos_index=1):
        import tensorflow as tf

        self.tf = tf
        self.model = model
        self.from_logits = from_logits
        self.pcos_index = int(pcos_index)
        layer = model.get_layer(feature_layer) if feature_layer else self._find_spatial_layer(model)
        self.layer_name = layer.name
        self._layer = layer
        try:  # flat models: tap the layer's output inside the model's own graph
            self.grad_model = tf.keras.Model(model.inputs, [layer.output, model.output])
        except Exception:
            # EfficientNetB0 nested inside a Sequential/functional wrapper: layer.output belongs
            # to the nested graph, so instead run the wrapper's layers in order (the usual
            # transfer-learning layout: [preprocessing] -> base -> pooling/dropout/dense).
            self.grad_model = None
            chain = [l for l in model.layers if not isinstance(l, tf.keras.layers.InputLayer)]
            if layer not in chain:
                raise ValueError("Could not tap this layer; pass feature_layer=<layer name>")
            self._chain = chain

    def _forward(self, x):
        """Returns (spatial feature map, predictions) with gradients recorded."""
        if self.grad_model is not None:
            return self.grad_model(x, training=False)
        h, A = x, None
        for l in self._chain:
            h = l(h)
            if l is self._layer:
                A = h
        return A, h

    @staticmethod
    def _find_spatial_layer(model):
        for layer in reversed(model.layers):
            try:
                if len(layer.output.shape) == 4:
                    return layer
            except Exception:
                continue
        raise ValueError("No layer with a spatial (4D) output found; pass feature_layer=...")

    def _out_index(self, class_index):
        """Meaning (1 = PCOS, 0 = Normal) -> which model output represents it."""
        return self.pcos_index if class_index == 1 else 1 - self.pcos_index

    def _score(self, preds, class_index):
        """Log-odds of the chosen class (avoids saturated gradients near p = 0 or 1)."""
        tf = self.tf
        o = self._out_index(class_index)
        if preds.shape[-1] == 1:  # one unit describes output-class 1
            z = preds[:, 0]
            if not self.from_logits:
                p = tf.clip_by_value(z, 1e-7, 1.0 - 1e-7)
                z = tf.math.log(p) - tf.math.log(1.0 - p)
            return z if o == 1 else -z
        z = preds[:, o]
        if not self.from_logits:
            p = tf.clip_by_value(z, 1e-7, 1.0 - 1e-7)
            z = tf.math.log(p) - tf.math.log(1.0 - p)
        return z

    def _p_pcos(self, preds):
        if preds.shape[-1] == 1:
            z = float(preds[0, 0])
            p1 = 1.0 / (1.0 + np.exp(-z)) if self.from_logits else z  # P(output class 1)
            return p1 if self.pcos_index == 1 else 1.0 - p1
        row = preds[0].astype(np.float64)
        if self.from_logits:
            e = np.exp(row - row.max())
            row = e / e.sum()
        return float(row[self.pcos_index])

    def heatmap(self, x, class_index=None):
        """x: 1xHxWx3 exactly as passed to model.predict. class_index: 1 = PCOS, 0 = Normal;
        None = whichever class the model predicts. Returns (cam in [0,1], P(PCOS), class_used)."""
        tf = self.tf
        x = tf.convert_to_tensor(x)
        with tf.GradientTape() as tape:
            A, preds = self._forward(x)
            if class_index is None:
                class_index = 1 if self._p_pcos(preds.numpy()) >= 0.5 else 0
            score = self._score(preds, class_index)
        g = tape.gradient(score, A)
        cam = _gradcampp_from(A[0].numpy(), g[0].numpy())
        return cam, self._p_pcos(preds.numpy()), class_index


class TorchGradCAMPlusPlus:
    """Grad-CAM++ for a PyTorch model.

    target_layer: the module whose output is the last spatial feature map. For torchvision's
    efficientnet_b0 that is model.features[-1] (detected automatically); for timm models pass
    e.g. model.conv_head. Set from_logits=False if the model already applies sigmoid/softmax.
    pcos_index: as for the Keras class (1 unit: 1 = unit is P(PCOS), 0 = unit is P(Not PCOS);
    2 units: the PCOS column, e.g. 0 if ImageFolder sorted "infected" before "notinfected").
    """

    def __init__(self, model, target_layer=None, from_logits=True, pcos_index=1):
        import torch

        self.torch = torch
        self.model = model.eval()
        self.from_logits = from_logits
        self.pcos_index = int(pcos_index)
        if target_layer is None:
            if hasattr(model, "features"):
                target_layer = model.features[-1]
            else:
                raise ValueError("Pass target_layer=... (e.g. model.conv_head for timm)")
        self._acts = None
        target_layer.register_forward_hook(lambda m, i, o: setattr(self, "_acts", o))

    def _out_index(self, class_index):
        """Meaning (1 = PCOS, 0 = Normal) -> which model output represents it."""
        return self.pcos_index if class_index == 1 else 1 - self.pcos_index

    def _logit(self, out, class_index):
        """Log-odds of the chosen class (avoids saturated gradients near p = 0 or 1)."""
        torch = self.torch
        o = self._out_index(class_index)
        flat = out.reshape(out.shape[0], -1)
        if flat.shape[1] == 1:  # one unit describes output-class 1
            z = flat[0, 0]
            if not self.from_logits:
                p = z.clamp(1e-7, 1 - 1e-7)
                z = torch.log(p) - torch.log(1 - p)
            return z if o == 1 else -z
        z = flat[0, o]
        if not self.from_logits:
            p = z.clamp(1e-7, 1 - 1e-7)
            z = torch.log(p) - torch.log(1 - p)
        return z

    def _p_pcos(self, out):
        torch = self.torch
        with torch.no_grad():
            flat = out.reshape(out.shape[0], -1)[0].double()
            if flat.numel() == 1:
                p1 = float(torch.sigmoid(flat[0]) if self.from_logits else flat[0])
                return p1 if self.pcos_index == 1 else 1.0 - p1
            row = torch.softmax(flat, -1) if self.from_logits else flat
            return float(row[self.pcos_index])

    def heatmap(self, x, class_index=None):
        """x: torch tensor 1x3xHxW exactly as fed to the model. Returns (cam, P(PCOS), class_used)."""
        torch = self.torch
        with torch.enable_grad():
            out = self.model(x)
            p_pcos = self._p_pcos(out)
            if class_index is None:
                class_index = 1 if p_pcos >= 0.5 else 0
            score = self._logit(out, class_index)
            g = torch.autograd.grad(score, self._acts)[0]
        A = self._acts[0].detach().permute(1, 2, 0).cpu().numpy()
        g = g[0].detach().permute(1, 2, 0).cpu().numpy()
        return _gradcampp_from(A, g), p_pcos, class_index


# =============================================================================== image outputs
def overlay_heatmap(rgb_uint8, cam, alpha=0.4):
    """Blend the (low-res) CAM over the image. Returns (overlay_uint8, cam_at_image_resolution)."""
    rgb = rgb_uint8
    if rgb.ndim == 2:
        rgb = np.stack([rgb] * 3, axis=-1)
    h, w = rgb.shape[:2]
    cam_up = np.clip(cv2.resize(cam.astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC), 0, 1)
    heat = cv2.cvtColor(cv2.applyColorMap((cam_up * 255).astype(np.uint8), cv2.COLORMAP_JET),
                        cv2.COLOR_BGR2RGB)
    out = ((1 - alpha) * rgb.astype(np.float32) + alpha * heat.astype(np.float32)).astype(np.uint8)
    return out, cam_up


def _png_b64(rgb_uint8):
    ok, buf = cv2.imencode(".png", cv2.cvtColor(rgb_uint8, cv2.COLOR_RGB2BGR))
    if not ok:
        raise RuntimeError("PNG encoding failed")
    return base64.b64encode(buf.tobytes()).decode("ascii")


def explain_image(image_explainer, x, rgb_uint8, class_index=None):
    """Grad-CAM++ for one ultrasound. Returns a JSON-ready dict."""
    h, w = rgb_uint8.shape[:2]
    scale = min(1.0, 640.0 / max(h, w))
    if scale < 1.0:
        rgb_uint8 = cv2.resize(
            rgb_uint8,
            (round(w * scale), round(h * scale)),
            interpolation=cv2.INTER_AREA,
        )
    cam, p_pcos, used = image_explainer.heatmap(x, class_index)
    overlay, cam_up = overlay_heatmap(rgb_uint8, cam)
    ys, xs = np.unravel_index(np.argmax(cam_up), cam_up.shape)
    return {
        "probability_pcos": round(float(p_pcos), 4),
        "explains_class": "PCOS" if used == 1 else "Not PCOS",
        "heatmap_overlay_png_base64": _png_b64(overlay),
        "heatmap_summary": {
            "peak_x_fraction": round(float(xs / cam_up.shape[1]), 3),
            "peak_y_fraction": round(float(ys / cam_up.shape[0]), 3),
            "fraction_of_image_above_50pct": round(float((cam_up > 0.5).mean()), 3),
        },
    }


def explain_case(clinical_explainer, clinical_features, image_explainer, x, rgb_uint8, top_k=8):
    """One payload for the frontend. Assumes the final score is the average of the two models'
    probabilities, so final - 0.5 splits EXACTLY into a clinical and an ultrasound part."""
    clin = clinical_explainer.explain_patient(clinical_features, top_k)
    img = explain_image(image_explainer, x, rgb_uint8)
    p_c, p_i = clin["probability_pcos"], img["probability_pcos"]
    final = (p_c + p_i) / 2.0
    return {
        "final_probability_pcos": round(final, 4),
        "prediction": "PCOS" if final >= 0.5 else "Not PCOS",
        "modality_contributions": {
            "clinical": round((p_c - 0.5) / 2.0, 4),
            "ultrasound": round((p_i - 0.5) / 2.0, 4),
            "note": "final - 0.5 = clinical + ultrasound (exact for probability averaging)",
        },
        "clinical": clin,
        "ultrasound": img,
    }


# =============================================================================== faithfulness (paper)
def cam_deletion_test(predict_fn, images, cams, fractions=(0.05, 0.1, 0.2, 0.3, 0.5), seed=0):
    """Do the heatmaps point at pixels the model actually relies on?

    predict_fn(batch of HxWx3 arrays as the model expects) -> P(PCOS) per image.
    images: list of HxWx3 arrays; cams: list of CAMs in [0,1] (any resolution).
    For each fraction q, the q most-salient pixels (or q random pixels) are replaced by the image
    mean; we report the mean confidence in the model's ORIGINAL prediction. A faithful heatmap
    lowers confidence much faster than random masking.
    """
    rng = np.random.default_rng(seed)
    X = np.stack(images).astype(np.float32)
    p0 = np.asarray(predict_fn(X), dtype=float)
    pred = p0 >= 0.5
    base = np.where(pred, p0, 1 - p0)
    res = {"baseline_confidence": float(base.mean()), "fractions": list(fractions),
           "cam_order": [], "random_order": []}
    for q in fractions:
        Xc, Xr = X.copy(), X.copy()
        for i, cam in enumerate(cams):
            h, w = X[i].shape[:2]
            sal = cv2.resize(np.asarray(cam, np.float32), (w, h), interpolation=cv2.INTER_CUBIC).ravel()
            k = max(1, int(q * h * w))
            top = np.argpartition(-sal, k - 1)[:k]
            rnd = rng.choice(h * w, size=k, replace=False)
            mean = X[i].mean(axis=(0, 1))
            for arr, idx in ((Xc, top), (Xr, rnd)):
                flat = arr[i].reshape(-1, X.shape[-1])
                flat[idx] = mean
                arr[i] = flat.reshape(h, w, -1)
        for key, arr in (("cam_order", Xc), ("random_order", Xr)):
            p = np.asarray(predict_fn(arr), dtype=float)
            res[key].append(float(np.where(pred, p, 1 - p).mean()))
    return res
