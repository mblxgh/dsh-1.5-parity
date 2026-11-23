@echo off
rem DeepSeek Harness 2.x patch kit - double click to install
rem All Chinese text lives in install.ps1 (this file must stay ASCII-only).
chcp 65001 >nul 2>&1
setlocal
set "PS1=%~dp0install.ps1"
if not exist "%PS1%" (
  echo install.ps1 not found next to this file.
  pause
  exit /b 1
)
where pwsh >nul 2>&1
if errorlevel 1 (
  echo pwsh 7 not found in PATH. Install PowerShell 7 first.
  pause
  exit /b 1
)
pwsh -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" pause
exit /b %RC%
