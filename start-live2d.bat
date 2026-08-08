@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js/npm not found. Please install Node.js first.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist "src\renderer\public\models\manifest.json" (
  echo Preparing Live2D models...
  call npm run prepare:models
  if errorlevel 1 (
    echo Model preparation failed.
    pause
    exit /b 1
  )
)

echo Starting Live2D streamer...
call npm run dev
