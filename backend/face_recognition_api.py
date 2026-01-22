"""
FastAPI Backend for Vision Mate Facial Recognition
Simple and clean implementation
"""

import io
import base64
from typing import List
from datetime import datetime

import cv2
import numpy as np
import traceback
from PIL import Image
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from simple_recognizer import SimpleFaceRecognizer, RecognitionResult


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
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:3000",
        "*"
    ],
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


# Models
class RecognitionResponse(BaseModel):
    success: bool
    faces: List[dict]
    message: str


class UsersResponse(BaseModel):
    users: dict
    count: int


# Helpers
def decode_base64_image(b64: str) -> np.ndarray:
    try:
        # print(f"DEBUG: Received base64 length: {len(b64)}")
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


# Endpoints
@app.get("/")
async def root():
    return {"service": "Vision Mate Face API", "status": "running"}


@app.get("/users", response_model=UsersResponse)
async def list_users():
    users = recognizer.list_users()
    return {"users": users, "count": len(users)}


@app.post("/recognize-base64")
async def recognize_base64(data: dict):
    try:
        img = decode_base64_image(data.get("image", ""))
        results = recognizer.recognize(img)
        faces = [result_to_dict(r) for r in results]
        return {"success": True, "faces": faces, "message": f"{len(faces)} face(s)"}
    except Exception as e:
        print(f"❌ Error in recognize_base64: {str(e)}")
        traceback.print_exc()
        raise HTTPException(500, str(e))


@app.post("/register-base64")
async def register_base64(data: dict):
    try:
        name = data.get("user_name", "").strip()
        if not name:
            raise HTTPException(400, "Name required")
        
        img = decode_base64_image(data.get("image", ""))
        user_id = recognizer.get_next_user_id()
        
        if recognizer.add_face(img, user_id, name):
            return {"success": True, "user_id": user_id, "user_name": name}
        raise HTTPException(400, "No face detected")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/train")
async def train():
    try:
        stats = recognizer.train()
        return {"success": True, "stats": stats}
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
    
    print("✅ Ready!")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
