@echo off
rem BackupSafe dev launcher - use when the unsigned build exe is blocked by Smart App Control.
rem Runs the same app via the reputable electron.exe, which SAC allows.
cd /d "%~dp0"
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo [ERROR] node_modules not found. Run "npm install" first.
  pause
  exit /b 1
)
start "BackupSafe" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
