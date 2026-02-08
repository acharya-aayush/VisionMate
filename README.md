# VisionMate

SXC Sandbox 2.0 Hackathon Winner

Team: JPT Coders

![MIT License](https://img.shields.io/badge/license-MIT-green)
![Winner](https://img.shields.io/badge/sxc%20sandbox%202.0-winner-blue)
![Python](https://img.shields.io/badge/python-3.10+-blue)
![React](https://img.shields.io/badge/frontend-react%20%7C%20vite%20%7C%20ts-blue)

**Team Members:**
- [Aayush Acharya](https://www.linkedin.com/in/acharyaaayush/) ([email](mailto:acharyaaayush2k4@gmail.com), [instagram](https://www.instagram.com/acharya.404/))
- Aaryan Bista
- Binish Shrestha
- Devesh Phaiju

## About

Face recognition system for visually impaired assistance.

**Tech Stack:**
- Backend: Python, FastAPI, OpenCV
- Algorithm: LBPH Face Recognizer
- Frontend: React, Vite, TypeScript, TensorFlow.js
- Accuracy: 40-70%

## Quick Start

### Prerequisites
- Python 3.10 or higher
- Node.js 18+
- Git

### Option 1: Automated Setup (Recommended)

Double-click `START.bat` in the root directory. This will:
- Install all dependencies (first time only)
- Start the backend server
- Start the frontend dev server
- Open the application in your default browser

### Option 2: Manual Setup

#### Backend Setup

1. Navigate to the backend folder:
```bash
cd backend
```

2. Run the setup script (first time only):
```bash
setup.bat
```

3. Start the backend server:
```bash
run_server.bat
```

Backend will be running at: `http://localhost:8000`
API Documentation: `http://localhost:8000/docs`

#### Frontend Setup

1. Navigate to the frontend folder:
```bash
cd frontend
```

2. Install dependencies (first time only):
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

Frontend will be running at: `http://localhost:5173`

## Project Structure

```
VisionMate/
├── backend/              # Python FastAPI backend
│   ├── face_recognition_api.py    # Main API server
│   ├── simple_recognizer.py       # Face recognition logic
│   ├── setup.bat                  # Setup script
│   ├── run_server.bat             # Start server
│   ├── requirements.txt           # Python dependencies
│   └── dataset/                   # Training images
├── frontend/             # React + Vite frontend
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
└── START.bat            # Quick launcher
```

## Features

- Real-time face recognition
- User registration with face capture
- Audio feedback for visually impaired users
- Web-based interface
- RESTful and WebSocket APIs

## API Endpoints

- `GET /` - Health check
- `GET /users` - List all registered users
- `POST /recognize-base64` - Recognize faces in image
- `POST /register-base64` - Register new user with face
- `POST /train` - Train the recognition model
- `WebSocket /ws/recognize` - Real-time recognition stream

## Development

### Backend Only
```bash
cd backend
run_server.bat
```

### Frontend Only
```bash
cd frontend
npm run dev
```

## License

MIT License
