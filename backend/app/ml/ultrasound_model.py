from io import BytesIO
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile

import torch
from PIL import Image
from torch import nn
from torchvision.models import efficientnet_b0

from app.core.config import settings

MODEL_CHECKPOINT_DIR = (
    Path(__file__).resolve().parents[2]
    / "pcos_efficientnet_b0.pt"
    / "pcos_efficientnet_b0"
)
IMAGE_SIZE = 224
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


class EfficientNetAttention(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = efficientnet_b0(weights=None).features
        self.attention_V = nn.Sequential(nn.Linear(1280, 256), nn.Tanh())
        self.attention_U = nn.Sequential(nn.Linear(1280, 256), nn.Sigmoid())
        self.attention_weights = nn.Linear(256, 1)
        self.classifier = nn.Sequential(
            nn.Linear(1280, 64),
            nn.ReLU(),
            nn.Dropout(p=0.5),
            nn.Linear(64, 2),
        )

    def forward(self, inputs):
        features = self.features(inputs)
        features = features.flatten(2).transpose(1, 2)
        attention = self.attention_weights(
            self.attention_V(features) * self.attention_U(features)
        ).softmax(dim=1)
        pooled = torch.sum(attention * features, dim=1)
        return self.classifier(pooled)


class UltrasoundModel:
    model_version = "EfficientNetB0-GatedAttention-v1"

    def __init__(self):
        self.model = None
        self.load_error = None
        self._load_model()

    @staticmethod
    def _checkpoint_stream():
        if not MODEL_CHECKPOINT_DIR.is_dir():
            raise FileNotFoundError(f"Model checkpoint directory not found: {MODEL_CHECKPOINT_DIR}")

        buffer = BytesIO()
        with ZipFile(buffer, "w", compression=ZIP_STORED) as archive:
            for entry in MODEL_CHECKPOINT_DIR.rglob("*"):
                if entry.is_file():
                    archive.write(entry, entry.relative_to(MODEL_CHECKPOINT_DIR.parent).as_posix())
        buffer.seek(0)
        return buffer

    def _load_model(self):
        try:
            state_dict = torch.load(
                self._checkpoint_stream(),
                map_location="cpu",
                weights_only=True,
            )
            model = EfficientNetAttention()
            model.load_state_dict(state_dict, strict=True)
            model.eval()
            self.model = model
            self.load_error = None
            print(f"[UltrasoundModel] Loaded {self.model_version} from {MODEL_CHECKPOINT_DIR}")
        except Exception as error:
            self.model = None
            self.load_error = str(error)
            print(f"[UltrasoundModel] Model load failed: {error}")

    @staticmethod
    def preprocess_image(image_path: str):
        import torchvision.transforms as transforms

        preprocess = transforms.Compose(
            [
                transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
                transforms.ToTensor(),
                transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
            ]
        )
        with Image.open(image_path) as image:
            return preprocess(image.convert("RGB")).unsqueeze(0)

    def predict(self, image_path: str):
        if not image_path:
            return {
                "prediction": "NOT_AVAILABLE",
                "probability": None,
                "model_version": self.model_version,
                "message": "Ultrasound estimate unavailable because no image was provided.",
            }
        if self.model is None:
            return {
                "prediction": "MODEL_UNAVAILABLE",
                "probability": None,
                "model_version": self.model_version,
                "error": self.load_error,
            }

        try:
            tensor = self.preprocess_image(image_path)
            with torch.inference_mode():
                probabilities = self.model(tensor).softmax(dim=1)[0]
            pcos_probability = float(probabilities[settings.ULTRASOUND_PCOS_CLASS_INDEX])
            prediction = "PCOS" if pcos_probability >= 0.5 else "Normal"
            return {
                "prediction": prediction,
                "probability": round(pcos_probability, 4),
                "model_version": self.model_version,
            }
        except Exception as error:
            return {
                "prediction": "ERROR",
                "probability": None,
                "model_version": self.model_version,
                "error": str(error),
            }

    def explain(self, image_path: str, status: str = "ANALYZED"):
        return {
            "method": "EfficientNet-B0 gated attention",
            "status": status,
            "heatmap_path": None,
        }


ultrasound_model = UltrasoundModel()