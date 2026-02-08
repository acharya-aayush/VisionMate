@echo off
cd /d "%~dp0"
if not exist "backend\venv" (
  cd backend
  call setup.bat
  cd ..
)
if not exist "frontend\node_modules" (
  cd frontend
  npm install
  cd ..
)
start "Backend" cmd /k "cd /d "%~dp0backend" && call venv\Scripts\activate.bat && python -m uvicorn face_recognition_api:app --reload --port 8000"
timeout /t 3 /nobreak >nul
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 5 /nobreak >nul
start http://localhost:5173
echo VisionMate is running.
pause
