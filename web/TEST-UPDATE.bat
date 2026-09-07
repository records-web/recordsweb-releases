@echo off
setlocal
cd /d "%~dp0"
echo Installing/updating RecordsWeb dependencies...
call npm install
if errorlevel 1 goto :error
echo.
echo Starting RecordsWeb update-screen simulator...
call npm run test:update
exit /b %errorlevel%
:error
echo.
echo RecordsWeb update test could not start.
pause
exit /b 1
