@echo off
setlocal
cd /d "%~dp0"
echo Installing/updating RecordsWeb dependencies...
call npm install
if errorlevel 1 goto :error
echo.
echo Starting RecordsWeb...
call npm run dev
exit /b %errorlevel%
:error
echo.
echo RecordsWeb could not start. Make sure Node.js 20 or newer is installed.
pause
exit /b 1
