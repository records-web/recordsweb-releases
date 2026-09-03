@echo off
setlocal
cd /d "%~dp0"
echo Installing/updating RecordsWeb dependencies...
call npm install
if errorlevel 1 goto :error

echo.
echo Building RecordsWeb Windows installer...
echo Any running packaged RecordsWeb instance will be closed automatically.
call npm run package:win
if errorlevel 1 goto :error

echo.
echo Build complete. Check the release folder for RecordsWeb-Setup-2.5.0.exe
pause
exit /b 0

:error
echo.
echo Build failed. Review the error above.
echo Make sure .env contains VITE_GITHUB_UPDATE_OWNER and VITE_GITHUB_UPDATE_REPO.
echo If Windows reports that app.asar is in use, close RecordsWeb and run npm run clean:release before rebuilding.
pause
exit /b 1
