"""
YOLO ONNX object detector for Vision Mate.
Provides a true backend inference path for higher-accuracy object detection.
"""

from __future__ import annotations

import shutil
import time
from pathlib import Path
from threading import Lock
from typing import Dict, List, Tuple

import numpy as np


class YoloOnnxDetector:
    """Lazy-loaded YOLO ONNX detector with optional one-time export fallback."""

    def __init__(self, model_path: str = "models/yolo11n.onnx", source_weights: str = "yolo11n.pt") -> None:
        self.model_path = Path(model_path)
        self.source_weights = source_weights
        self._model = None
        self._lock = Lock()

    def warmup(self) -> None:
        self._ensure_model_loaded()

    def _export_onnx_if_missing(self) -> None:
        if self.model_path.exists():
            return

        self.model_path.parent.mkdir(parents=True, exist_ok=True)

        # Import is local to avoid startup cost if accurate mode is never used.
        from ultralytics import YOLO

        exporter = YOLO(self.source_weights)
        exported = Path(
            exporter.export(
                format="onnx",
                imgsz=640,
                simplify=True,
            )
        )

        if exported.resolve() != self.model_path.resolve():
            shutil.copy2(exported, self.model_path)

    def _ensure_model_loaded(self) -> None:
        if self._model is not None:
            return

        with self._lock:
            if self._model is not None:
                return

            self._export_onnx_if_missing()

            from ultralytics import YOLO

            self._model = YOLO(str(self.model_path))

    def detect(
        self,
        image_bgr: np.ndarray,
        confidence: float = 0.45,
        max_results: int = 12,
    ) -> Tuple[List[Dict], float]:
        if image_bgr is None or image_bgr.size == 0:
            raise ValueError("Input frame is empty")

        try:
            self._ensure_model_loaded()
        except Exception as exc:
            raise RuntimeError(
                "YOLO ONNX model is unavailable. Ensure ultralytics and onnxruntime are installed, and model export can run."
            ) from exc

        start = time.perf_counter()

        results = self._model.predict(
            source=image_bgr,
            conf=confidence,
            iou=0.45,
            max_det=max_results,
            device="cpu",
            verbose=False,
        )

        latency_ms = (time.perf_counter() - start) * 1000

        if not results:
            return [], latency_ms

        result = results[0]
        names = result.names
        boxes = result.boxes

        detections: List[Dict] = []
        if boxes is not None and boxes.xyxy is not None:
            xyxy = boxes.xyxy.cpu().numpy()
            confs = boxes.conf.cpu().numpy()
            classes = boxes.cls.cpu().numpy()

            for bbox, score, cls_id in zip(xyxy, confs, classes):
                x1, y1, x2, y2 = [float(v) for v in bbox.tolist()]
                label = str(names.get(int(cls_id), int(cls_id)))
                detections.append(
                    {
                        "label": label,
                        "score": float(score),
                        "bbox": [x1, y1, x2, y2],
                    }
                )

        return detections, latency_ms
