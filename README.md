# VisionMate

## Overview
VisionMate is a browser-based vision assistant with a React frontend and a FastAPI backend.
The codebase implements separate pipelines for face recognition and object detection.

## Core Functional Modules
- Face recognition module: stable
	- LBPH face recognition runs on the backend and is exposed through HTTP and WebSocket endpoints.
- Object detection module: partially working
	- Two paths exist: browser detection (TensorFlow.js) and backend detection (YOLO ONNX).
	- Backend accurate mode can return runtime errors if model export/inference dependencies are not fully available.
- Audio feedback module: partially working
	- Uses browser SpeechSynthesis API in frontend pages.
	- Behavior depends on browser support and user permission state.
- Camera / QR module: experimental
	- Local camera mode and mobile relay mode are implemented.
	- Mobile relay relies on same-network routing, session IDs, and short-lived in-memory frame storage.

## System Architecture (High Level)
- Frontend (React + Vite) handles camera input, rendering overlays, and speech output.
- Backend (FastAPI) handles face recognition, user registration/training, object detection, and relay endpoints.
- Frontend communicates with backend over HTTP (`/recognize-base64`, `/object-detect-base64`, relay endpoints) and optional WebSocket (`/ws/recognize`).

## Tech Stack
- Backend: Python, FastAPI, Uvicorn, OpenCV (opencv-contrib-python), NumPy, Pillow, Ultralytics, ONNX Runtime
- Frontend: React, TypeScript, Vite, TensorFlow.js (CDN scripts), ONNX Runtime Web, React Router, TanStack Query

## Setup Instructions

Backend:
1. `cd backend`
2. `python -m venv venv`
3. `venv\Scripts\activate`
4. `pip install -r requirements.txt`
5. `python -m uvicorn face_recognition_api:app --host 0.0.0.0 --port 8000`

Frontend:
1. `cd frontend`
2. `npm install`
3. `npm run dev`

Environment requirements:
- Python runtime: UNVERIFIED FROM CODEBASE
- Node.js runtime: UNVERIFIED FROM CODEBASE
- Browser with camera access and SpeechSynthesis support for full frontend behavior

## API Summary
- `GET /`: service health response
- `GET /network-info`: LAN IP candidates for mobile relay pairing
- `GET /users`: list registered user IDs/names
- `DELETE /users/{user_id}`: remove user mapping and dataset folder, then retrain
- `POST /recognize-base64`: detect and recognize faces from base64 image
- `POST /register-base64`: add user face from base64 image and retrain
- `POST /mobile-stream/{session_id}/frame`: upload latest mobile frame
- `GET /mobile-stream/{session_id}/latest`: fetch latest mobile frame for session
- `POST /object-detect-base64`: run YOLO ONNX object detection on base64 image
- `POST /train`: retrain LBPH model with dataset images
- `WS /ws/recognize`: receive base64 frames and return recognition result stream

## Limitations
- Object detection has known runtime instability when accurate backend mode dependencies are incomplete.
- `backend/setup.bat` does not install all YOLO-related dependencies currently required by `requirements.txt`.
- Mobile relay stores frames in process memory with short TTL and no persistence.
- No authentication/authorization is implemented for API endpoints.
- Production readiness characteristics (security hardening, scaling, observability) are UNVERIFIED FROM CODEBASE.

## Documentation Link
[documentation.md](documentation.md)
