# VisionMate Backend Documentation

Python backend for face recognition.

Stack:
- Python, FastAPI, Uvicorn
- OpenCV (opencv-contrib-python) for face detection/recognition
- LBPH algorithm (simple, works offline)
- NumPy, Pillow for image processing

Why:
OpenCV is fast, easy, and works everywhere. LBPH is robust for small datasets and doesn't need a GPU.

How it works:
- Images are stored in dataset/ as grayscale jpgs per user.
- LBPH model is trained with train_face.py.
- API (face_recognition_api.py) loads the model and does recognition on request.
- Model and label mapping saved as trainer.yml and user_mapping.json.

Endpoints:
- /recognize-base64: POST base64 image, get user prediction.

To train:
- Put images in dataset/userX/
- Run train_face.py
- Start API with run_server.bat

Backend is called by the frontend for face recognition. No UI here, just API and model logic.