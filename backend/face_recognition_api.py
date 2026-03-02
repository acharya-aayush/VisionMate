"""
FastAPI Backend for Vision Mate Facial Recognition
Simple and clean implementation
"""

import io
import base64
import time
import os
import socket
from typing import Any, Dict, List, Optional
from datetime import datetime

import cv2
import numpy as np
import traceback
from PIL import Image
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from simple_recognizer import SimpleFaceRecognizer, RecognitionResult
from yolo_onnx_detector import YoloOnnxDetector


# FastAPI app
app = FastAPI(
    title="Vision Mate Face Recognition API",
    description="Face recognition for visually impaired assistance",
    version="2.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173"
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize recognizer
recognizer = SimpleFaceRecognizer(
    dataset_path="dataset",
    model_path="face_model.yml",
    user_mapping_path="user_mapping.json",
    confidence_threshold=80.0
)

MOBILE_FRAME_TTL_SECONDS = 6
mobile_frame_store: Dict[str, Dict[str, Any]] = {}
yolo_detector = YoloOnnxDetector(
    model_path=os.getenv("YOLO_ONNX_MODEL_PATH", "models/yolo11n.onnx"),
    source_weights=os.getenv("YOLO_SOURCE_WEIGHTS", "yolo11n.pt"),
)


# Models
class RecognitionResponse(BaseModel):
    success: bool
    faces: List[dict]
    message: str


class UsersResponse(BaseModel):
    users: dict
    count: int


class Base64ImageRequest(BaseModel):
    image: str = Field(min_length=1)


class RegisterFaceRequest(Base64ImageRequest):
    user_name: str = Field(min_length=1, max_length=64)


class DeleteUserResponse(BaseModel):
    success: bool
    user_id: int
    message: str


class MobileFrameStateResponse(BaseModel):
    success: bool
    has_frame: bool
    updated_at: Optional[str] = None
    image: Optional[str] = None


class ObjectDetectionRequest(Base64ImageRequest):
    confidence: float = Field(default=0.45, ge=0.2, le=0.95)
    max_results: int = Field(default=12, ge=1, le=40)


class ObjectDetectionItem(BaseModel):
    label: str
    score: float
    bbox: List[float]


class ObjectDetectionResponse(BaseModel):
    success: bool
    engine: str
    objects: List[ObjectDetectionItem]
    latency_ms: float
    message: str


class NetworkInfoResponse(BaseModel):
    success: bool
    bind_host: str
    port: int
    lan_ips: List[str]


# Helpers
def decode_base64_image(b64: str) -> np.ndarray:
    try:
        if not b64:
            raise ValueError("Image payload is required")

        if ',' in b64:
            b64 = b64.split(',')[1]
        
        image_bytes = base64.b64decode(b64)
        
        img = Image.open(io.BytesIO(image_bytes))
        
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        return np.array(img)
    except Exception as e:
        print(f"❌ Error in decode_base64_image: {e}")
        traceback.print_exc()
        raise


def result_to_dict(r: RecognitionResult) -> dict:
    """Convert RecognitionResult to JSON-serializable dict matching frontend interface"""
    face_loc = None
    if r.face_location:
        # Tuple is (top, right, bottom, left)
        face_loc = {
            "top": int(r.face_location[0]),
            "right": int(r.face_location[1]),
            "bottom": int(r.face_location[2]),
            "left": int(r.face_location[3])
        }

    return {
        "user_id": int(r.user_id) if r.user_id is not None else None,
        "user_name": str(r.user_name) if r.user_name else "Unknown",
        "confidence": float(r.confidence),
        "is_known": bool(r.is_known),
        "face_location": face_loc
    }


def normalize_session_id(raw_session_id: str) -> str:
    session_id = "".join(
        c for c in raw_session_id.strip().lower() if c.isalnum() or c in ("-", "_")
    )[:32]
    if len(session_id) < 4:
        raise HTTPException(400, "Invalid session ID")
    return session_id


def prune_mobile_sessions() -> None:
    now = time.time()
    stale = [
        key
        for key, value in mobile_frame_store.items()
        if now - float(value.get("updated_epoch", 0)) > MOBILE_FRAME_TTL_SECONDS
    ]
    for key in stale:
        mobile_frame_store.pop(key, None)


def get_lan_ipv4_candidates() -> List[str]:
    candidates: List[str] = []

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            ip = sock.getsockname()[0]
            if ip and not ip.startswith(("127.", "169.254.")):
                candidates.append(ip)
    except Exception:
        pass

    try:
        host_name = socket.gethostname()
        for result in socket.getaddrinfo(host_name, None, family=socket.AF_INET):
            ip = result[4][0]
            if ip and not ip.startswith(("127.", "169.254.")):
                candidates.append(ip)
    except Exception:
        pass

    deduped: List[str] = []
    seen = set()
    for ip in candidates:
        if ip in seen:
            continue
        seen.add(ip)
        deduped.append(ip)
    return deduped


# Endpoints
@app.get("/")
async def root():
    return {"service": "Vision Mate Face API", "status": "running"}


@app.get("/network-info", response_model=NetworkInfoResponse)
async def network_info():
    return {
        "success": True,
        "bind_host": "0.0.0.0",
        "port": 8000,
        "lan_ips": get_lan_ipv4_candidates(),
    }


@app.get("/users", response_model=UsersResponse)
async def list_users():
    users = recognizer.list_users()
    return {"users": users, "count": len(users)}


@app.delete("/users/{user_id}", response_model=DeleteUserResponse)
async def delete_user(user_id: int):
    if user_id <= 0:
        raise HTTPException(400, "Invalid user ID")

    removed = recognizer.remove_user(user_id)
    if not removed:
        raise HTTPException(404, f"User {user_id} not found")

    return {
        "success": True,
        "user_id": user_id,
        "message": f"User {user_id} deleted successfully"
    }


@app.post("/recognize-base64")
async def recognize_base64(data: Base64ImageRequest):
    try:
        img = decode_base64_image(data.image)
        results = recognizer.recognize(img)
        faces = [result_to_dict(r) for r in results]
        return {
            "success": True,
            "faces": faces,
            "message": f"{len(faces)} face(s)",
            "timestamp": datetime.now().isoformat()
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        print(f"❌ Error in recognize_base64: {str(e)}")
        traceback.print_exc()
        raise HTTPException(500, str(e))


@app.post("/register-base64")
async def register_base64(data: RegisterFaceRequest):
    try:
        name = data.user_name.strip()
        if not name:
            raise HTTPException(400, "Name required")
        
        img = decode_base64_image(data.image)
        user_id = recognizer.get_next_user_id()
        
        if recognizer.add_face(img, user_id, name):
            return {
                "success": True,
                "user_id": user_id,
                "user_name": name,
                "message": f"{name} registered successfully"
            }
        raise HTTPException(400, "No face detected")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/mobile-stream/{session_id}/frame", response_model=MobileFrameStateResponse)
async def receive_mobile_frame(session_id: str, data: Base64ImageRequest):
    normalized_session = normalize_session_id(session_id)
    now_epoch = time.time()
    now_iso = datetime.now().isoformat()

    mobile_frame_store[normalized_session] = {
        "image": data.image,
        "updated_at": now_iso,
        "updated_epoch": now_epoch,
    }

    return {
        "success": True,
        "has_frame": True,
        "updated_at": now_iso,
    }


@app.get("/mobile-stream/{session_id}/latest", response_model=MobileFrameStateResponse)
async def get_mobile_frame(session_id: str):
    normalized_session = normalize_session_id(session_id)
    prune_mobile_sessions()

    frame_data = mobile_frame_store.get(normalized_session)
    if not frame_data:
        return {
            "success": True,
            "has_frame": False,
        }

    return {
        "success": True,
        "has_frame": True,
        "updated_at": frame_data.get("updated_at"),
        "image": frame_data.get("image"),
    }


@app.post("/object-detect-base64", response_model=ObjectDetectionResponse)
async def detect_objects_base64(data: ObjectDetectionRequest):
    try:
        image_rgb = decode_base64_image(data.image)
        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

        objects, latency_ms = yolo_detector.detect(
            image_bgr=image_bgr,
            confidence=data.confidence,
            max_results=data.max_results,
        )

        return {
            "success": True,
            "engine": "yolo-onnx",
            "objects": objects,
            "latency_ms": round(latency_ms, 2),
            "message": f"{len(objects)} object(s) detected",
        }
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        print(f"❌ Error in detect_objects_base64: {exc}")
        traceback.print_exc()
        raise HTTPException(500, str(exc))


@app.post("/train")
async def train(max_samples: int = Query(default=50, ge=5, le=300)):
    try:
        stats = recognizer.train(max_per_user=max_samples)
        return {
            "success": True,
            "stats": stats,
            "message": f"Training complete with up to {max_samples} samples per user"
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# WebSocket for real-time
@app.websocket("/ws/recognize")
async def ws_recognize(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            try:
                img = decode_base64_image(data.get("image", ""))
                results = recognizer.recognize(img)
                await ws.send_json({
                    "success": True,
                    "faces": [result_to_dict(r) for r in results]
                })
            except Exception as e:
                await ws.send_json({"success": False, "error": str(e)})
    except WebSocketDisconnect:
        pass


# Startup
@app.on_event("startup")
async def startup():
    print("\n🚀 Vision Mate Face API Starting...")
    print(f"   Users: {recognizer.list_users()}")
    print(f"   Trained: {recognizer.is_trained}")
    
    if not recognizer.is_trained:
        print("   Training on dataset...")
        recognizer.train()

    if os.getenv("YOLO_WARMUP", "false").lower() == "true":
        try:
            print("   Warming up YOLO ONNX detector...")
            yolo_detector.warmup()
            print("   YOLO ONNX ready")
        except Exception as exc:
            print(f"   ⚠️ YOLO warmup skipped: {exc}")
    
    print("✅ Ready!")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
