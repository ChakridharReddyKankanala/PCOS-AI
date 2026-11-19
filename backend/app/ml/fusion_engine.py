class FusionEngine:
    version = "Clinical-Ultrasound-Fusion-v1"

    def combine(self, clinical: dict, ultrasound: dict | None = None):
        cp = clinical.get("probability") if clinical else None
        up = ultrasound.get("probability") if ultrasound else None

        if cp is not None and up is not None:
            combined_prob = round((cp + up) / 2, 4)
            method = "dual_modal_weighted_average"
        elif cp is not None:
            combined_prob = round(cp, 4)
            method = "clinical_only"
        elif up is not None:
            combined_prob = round(up, 4)
            method = "ultrasound_only"
        else:
            return {
                "prediction": "UNAVAILABLE",
                "probability": None,
                "confidence_score": 0.0,
                "method": "insufficient_data",
                "model_version": self.version
            }

        prediction = "PCOS" if combined_prob >= 0.5 else "Normal"
        confidence = round(max(combined_prob, 1.0 - combined_prob) * 100.0, 1)

        return {
            "prediction": prediction,
            "probability": combined_prob,
            "confidence_score": confidence,
            "method": method,
            "model_version": self.version
        }

fusion_engine = FusionEngine()
