@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
echo Starting Vision Mate Face Recognition API...
echo Server: http://0.0.0.0:8000
echo Docs:   http://0.0.0.0:8000/docs
echo.
python -m uvicorn face_recognition_api:app --host 0.0.0.0 --reload --port 8000
