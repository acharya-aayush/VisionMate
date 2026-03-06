# Technical Documentation

## 1. System Overview
VisionMate is an API-backed computer vision system with a browser frontend.

System classification:
- AI vision system with mixed inference modes (browser-side and backend-side)
- API-based inference pipeline for face recognition and object detection
- Optional WebSocket recognition stream support

## 2. Module-Level Architecture

### Face Recognition Module
Purpose:
- Identify known users from camera frames.

Implementation approach:
- Backend module `simple_recognizer.py` uses Haar Cascade for face detection and LBPH for recognition.
- API layer in `face_recognition_api.py` exposes register/recognize/train/delete operations.

Dependencies:
- OpenCV (`opencv-contrib-python`), NumPy, Pillow, FastAPI.

Stability status:
- stable

### Object Detection Module
Purpose:
- Detect non-face objects in camera frames.

Implementation approach:
- Frontend `CameraView.tsx` supports two engines:
  - `fast-browser`: TensorFlow.js COCO-SSD in browser
  - `accurate-yolo`: backend `POST /object-detect-base64`
- Backend `yolo_onnx_detector.py` loads/exports YOLO ONNX and runs prediction via Ultralytics.
- Frontend optionally blends track confidence with `hybridObjectService.ts` (ONNX Runtime Web MobileNet scoring).

Dependencies:
- Backend: Ultralytics, ONNX Runtime, OpenCV.
- Frontend: TensorFlow.js scripts from CDN, ONNX Runtime Web.

Stability status:
- partially working

### QR / Camera Module
Purpose:
- Provide camera input from local device or mobile relay.

Implementation approach:
- Local camera mode: browser camera stream via `getUserMedia`.
- Mobile relay mode:
  - Phone page (`/mobile-camera`) captures frames and uploads to backend relay endpoint.
  - Laptop page polls latest session frame and feeds it into detection loop.
- Pairing link/QR generated in `CameraView.tsx` using dynamic `qrcode` import.

Dependencies:
- Browser camera APIs, QR code library, backend relay endpoints.

Stability status:
- experimental

### Audio Feedback System
Purpose:
- Announce detections and status messages.

Implementation approach:
- Frontend pages (`CameraView.tsx`, `FaceRecognition.tsx`, `Settings.tsx`) use `window.speechSynthesis` and `SpeechSynthesisUtterance`.
- Announcement behavior is gated by user settings (`speakDetections`, `detectionMode`, `speechRate`).

Dependencies:
- Browser SpeechSynthesis API.

Stability status:
- partially working

### Frontend Interface
Purpose:
- Provide user controls, display camera overlays, and trigger backend calls.

Implementation approach:
- React routes:
  - `/camera` object detection page
  - `/mobile-camera` phone relay page
  - `/faces` face recognition page
  - `/settings` user preferences
- Runtime API base URL via `src/config/runtime.ts`.

Dependencies:
- React, React Router, TypeScript, Vite.

Stability status:
- stable

## 3. Data Flow Pipeline

### Face Recognition Pipeline
1. Frontend captures video frame as JPEG base64.
2. Frontend sends `POST /recognize-base64` with `{ image }`.
3. Backend decodes base64 (`decode_base64_image`).
4. Backend runs face detection and LBPH prediction (`recognizer.recognize`).
5. Backend maps outputs to response schema (`result_to_dict`).
6. Frontend receives face list and redraws overlay labels/boxes.
7. Frontend optionally speaks recognized/unknown summaries.

### Object Detection Pipeline (Accurate Mode)
1. Frontend captures video frame as JPEG base64.
2. Frontend sends `POST /object-detect-base64` with `{ image, confidence, max_results }`.
3. Backend decodes base64 and converts RGB to BGR.
4. Backend YOLO detector loads or exports ONNX model if needed.
5. Backend runs `predict(...)` and emits label/score/bbox list.
6. Frontend tracks boxes with SimpleSort and renders overlays.
7. Frontend optionally computes additional confidence using ONNX Runtime Web scoring.
8. Frontend optionally speaks top object guidance.

### Object Detection Pipeline (Fast Browser Mode)
1. Frontend reads local or relay-fed video frame.
2. Frontend runs `handpose` and `cocoSsd` directly in browser runtime.
3. Frontend converts detections to tracker input.
4. Frontend tracks and renders stable objects.
5. Frontend optionally speaks object guidance.

### Mobile Relay Pipeline
1. Phone opens `/mobile-camera?session=...&api=...`.
2. Phone page captures frames and posts to `POST /mobile-stream/{session_id}/frame`.
3. Backend stores latest frame in memory for the normalized session ID.
4. Laptop page polls `GET /mobile-stream/{session_id}/latest`.
5. Retrieved frame is drawn into an offscreen canvas and fed into detection loop.

## 4. Model Details

### Face Detection Model
- Type: Haar Cascade (`haarcascade_frontalface_default.xml`)
- Training method: Pretrained cascade provided by OpenCV
- Input format: Grayscale image
- Output format: Bounding boxes converted to `(top, right, bottom, left)`
- Known limitations:
  - Classical detector sensitivity to lighting, angle, and resolution.

### Face Recognition Model
- Type: LBPH (`cv2.face.LBPHFaceRecognizer_create`)
- Training method:
  - Trained from `backend/dataset/user*/**.jpg`
  - Triggered by startup (if model missing), `/train`, and registration/deletion flows
- Input format: Detected face ROI resized to `200x200` grayscale
- Output format:
  - Predicted `user_id` and LBPH confidence converted to UI confidence scale
- Known limitations:
  - Requires dataset quality and per-user image coverage.
  - Returns empty result if model is not trained.

### Backend Object Detection Model
- Type: YOLO exported to ONNX
- Training method: UNVERIFIED FROM CODEBASE (weights loaded/exported, not trained in repository code)
- Input format: BGR frame array
- Output format: `[{ label, score, bbox: [x1, y1, x2, y2] }]`
- Known limitations:
  - Runtime may fail if ONNX export/inference dependencies are unavailable.
  - Inference is explicitly configured with `device="cpu"`.

### Browser Object Detection Models
- Type:
  - Hand model: TensorFlow.js Handpose
  - Object model: TensorFlow.js COCO-SSD
  - Optional confidence scorer: MobileNetV3 ONNX in ONNX Runtime Web (`wasm` provider)
- Training method: UNVERIFIED FROM CODEBASE (pretrained external models are loaded)
- Input format: Browser video frame
- Output format: Bounding boxes and scores used by frontend tracker
- Known limitations:
  - Relies on external CDN/model fetch and browser runtime capabilities.

GPU usage note:
- Backend GPU acceleration is UNVERIFIED FROM CODEBASE.
- Current backend detector call uses CPU explicitly.

## 5. API Layer

### Endpoint Contracts

`GET /`
- Request: none
- Response:
  - `service: string`
  - `status: string`
- Internal mapping:
  - `root()`

`GET /network-info`
- Request: none
- Response:
  - `success: bool`
  - `bind_host: string`
  - `port: int`
  - `lan_ips: string[]`
- Internal mapping:
  - `network_info()` -> `get_lan_ipv4_candidates()`

`GET /users`
- Request: none
- Response:
  - `users: { [id: string]: name }`
  - `count: int`
- Internal mapping:
  - `list_users()` -> `recognizer.list_users()`

`DELETE /users/{user_id}`
- Request:
  - path param `user_id: int`
- Response:
  - `success: bool`
  - `user_id: int`
  - `message: string`
- Internal mapping:
  - `delete_user()` -> `recognizer.remove_user(user_id)`

`POST /recognize-base64`
- Request body:
  - `image: string` (base64 payload)
- Response:
  - `success: bool`
  - `faces: []`
  - `message: string`
  - `timestamp: string`
- Internal mapping:
  - `recognize_base64()` -> `decode_base64_image()` -> `recognizer.recognize()` -> `result_to_dict()`

`POST /register-base64`
- Request body:
  - `user_name: string`
  - `image: string`
- Response:
  - `success: bool`
  - `user_id: int`
  - `user_name: string`
  - `message: string`
- Internal mapping:
  - `register_base64()` -> `decode_base64_image()` -> `recognizer.get_next_user_id()` -> `recognizer.add_face()`

`POST /mobile-stream/{session_id}/frame`
- Request body:
  - `image: string`
- Response:
  - `success: bool`
  - `has_frame: bool`
  - `updated_at?: string`
- Internal mapping:
  - `receive_mobile_frame()` -> `normalize_session_id()` -> write to `mobile_frame_store`

`GET /mobile-stream/{session_id}/latest`
- Request: path param `session_id`
- Response:
  - `success: bool`
  - `has_frame: bool`
  - `updated_at?: string`
  - `image?: string`
- Internal mapping:
  - `get_mobile_frame()` -> `normalize_session_id()` -> `prune_mobile_sessions()` -> read `mobile_frame_store`

`POST /object-detect-base64`
- Request body:
  - `image: string`
  - `confidence: float` (0.2 to 0.95)
  - `max_results: int` (1 to 40)
- Response:
  - `success: bool`
  - `engine: string`
  - `objects: [{ label, score, bbox }]`
  - `latency_ms: float`
  - `message: string`
- Internal mapping:
  - `detect_objects_base64()` -> `decode_base64_image()` -> `cv2.cvtColor()` -> `yolo_detector.detect()`

`POST /train`
- Request:
  - query param `max_samples` (5 to 300)
- Response:
  - `success: bool`
  - `stats: { processed, failed, users }`
  - `message: string`
- Internal mapping:
  - `train()` -> `recognizer.train(max_per_user=max_samples)`

`WS /ws/recognize`
- Request message:
  - `{ image: string, ... }`
- Response message:
  - success path: `{ success: true, faces: [...] }`
  - failure path: `{ success: false, error: string }`
- Internal mapping:
  - `ws_recognize()` -> `decode_base64_image()` -> `recognizer.recognize()`

## 6. Real-Time Components

Implemented real-time mechanisms:
- Frontend recognition loop:
  - Face recognition page captures and sends frames on a timed loop (`setTimeout`, 500 ms).
- Frontend object detection loop:
  - Uses `requestAnimationFrame` for per-frame processing.
  - Backend accurate-object requests are rate-limited (minimum interval ~220 ms).
- Mobile relay:
  - Phone frame upload interval ~130 ms.
  - Laptop polling interval ~140 ms.
- WebSocket recognition endpoint:
  - Implemented in backend and frontend service class.
  - Active usage in current page components is UNVERIFIED FROM CODEBASE.

Synchronization method:
- Mobile relay uses normalized session ID and `updated_at` timestamp to detect new frames.

## 7. Error Handling & Edge Cases

Invalid image input:
- Backend rejects empty/invalid base64 payloads and can return HTTP 400.
- Decoder exceptions are surfaced as HTTP errors.

Model failure:
- Object detection runtime errors are mapped to HTTP 503 (`RuntimeError`) or HTTP 500 (unexpected exceptions).
- Frontend accurate mode sets warning state when backend object detection fails.

Missing dataset or weak dataset:
- `SimpleFaceRecognizer.train()` returns without training when dataset is missing or too small.
- Recognition returns empty list when `is_trained` is false.

Empty prediction:
- Face recognition returns success with empty `faces` array when no match/no face.
- Object detection returns success with empty `objects` list when no objects are predicted.

Broken module behavior:
- Browser model script load timeout in camera page triggers user-visible error toast.
- Mobile relay polling/upload failures are logged and reported in UI status text.

Session edge cases:
- Session ID normalization rejects short/invalid IDs with HTTP 400.
- Mobile frame cache entries expire after TTL (`MOBILE_FRAME_TTL_SECONDS = 6`).

## 8. Experimental / Unstable Components

1. Backend accurate object detection path
- Status: partially working
- Reason:
  - Requires ONNX export/inference runtime path to succeed at runtime.
  - Dependency and model asset availability can break initialization.
- Risk:
  - Runtime 503/500 errors and inconsistent startup readiness.

2. Mobile QR relay path
- Status: experimental
- Reason:
  - Depends on LAN routing, host resolution, and browser/network permissions.
  - Uses in-memory frame transport with no persistence.
- Risk:
  - Relay interruptions and stale/missing frames in unstable network conditions.

3. WebSocket recognition integration
- Status: unverified
- Reason:
  - Endpoint and client class exist; direct page-level usage is not confirmed in inspected components.
- Risk:
  - Potential drift between maintained endpoint and active UI path.

## 9. System Limitations

Accuracy limitations:
- No validated accuracy benchmark is embedded in API runtime code.
- Recognition quality is strongly dependent on dataset quality and capture conditions.

Dataset dependency issues:
- User registration and retraining directly modify local dataset and mapping files.
- Model quality can degrade if stored samples are low quality or imbalanced.

Performance constraints:
- Backend YOLO path currently uses CPU execution.
- Browser inference path depends on client device/browser performance.
- Base64 frame transport adds encoding/transfer overhead.

Security and production readiness:
- API endpoints are unauthenticated in current code.
- Frame relay is in-memory only and not designed for durable production streaming.
- Deployment hardening status is UNVERIFIED FROM CODEBASE.

Operational consistency:
- `backend/setup.bat` and `backend/requirements.txt` are not fully aligned for object-detection dependencies.

## 10. Development & Execution

Backend start:
1. `cd backend`
2. `venv\Scripts\activate`
3. `python -m uvicorn face_recognition_api:app --host 0.0.0.0 --port 8000`

Alternative backend launcher:
- `backend/run_server.bat`

Frontend start:
1. `cd frontend`
2. `npm install`
3. `npm run dev`

Training trigger:
- API endpoint: `POST /train?max_samples=<n>`
- Automatic retrain paths:
  - New user registration (`/register-base64`)
  - User deletion (`DELETE /users/{user_id}`)

Debugging notes observed in code:
- Backend logs startup user/training state and optional YOLO warmup result.
- Camera page shows model load timeout, backend warning, and relay status text.
- Benchmark utility exists at `backend/benchmark_navigation.py` for recognition endpoint latency checks.
