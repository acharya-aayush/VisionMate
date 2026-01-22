@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
echo Starting Vision Mate Face Recognition API...
echo Server: http://localhost:8000
echo Docs:   http://localhost:8000/docs
echo.
python -m uvicorn face_recognition_api:app --reload --port 8000
