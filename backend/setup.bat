@echo off
echo ========================================
echo  Vision Mate - Fresh Setup
echo ========================================
echo.

cd /d "%~dp0"

echo Step 1: Creating virtual environment...
python -m venv venv

echo.
echo Step 2: Activating virtual environment...
call venv\Scripts\activate.bat

echo.
echo Step 3: Upgrading pip...
python -m pip install --upgrade pip

echo.
echo Step 4: Installing dependencies...
pip install fastapi uvicorn[standard] opencv-contrib-python python-multipart Pillow numpy

echo.
echo ========================================
echo  Setup Complete!
echo ========================================
echo.
echo To start the server, run:
echo   1. venv\Scripts\activate
echo   2. python -m uvicorn face_recognition_api:app --reload --port 8000
echo.
echo Or simply run: run_server.bat
echo.
pause
