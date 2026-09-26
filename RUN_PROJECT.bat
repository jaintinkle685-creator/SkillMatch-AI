@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SkillMatch AI - Final Project

set "URL=http://127.0.0.1:8000/?freshLaunch=1"
set "PYTHON="

cls
echo ================================================
echo        SkillMatch AI - Final Project
echo ================================================
echo.
echo [1/5] Checking Python...

for /f "delims=" %%P in ('where python.exe 2^>nul') do if not defined PYTHON set "PYTHON=%%P"
if not defined PYTHON (
    echo.
    echo ERROR: Python was not found in PATH.
    echo Please install Python 3.10+ with "Add Python to PATH" enabled.
    echo.
    pause
    exit /b 1
)

echo       Python: %PYTHON%

echo.
echo [2/5] Checking Python dependencies...

REM Install the only required backend package if it is missing.
REM This makes the final project portable to a clean Windows/Python installation.
"%PYTHON%" -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo       Flask is not installed. Installing project dependencies...
    "%PYTHON%" -m pip install -r "%~dp0requirements.txt"
    if errorlevel 1 (
        echo.
        echo ERROR: Could not install Flask.
        echo Make sure this PC has internet access, then run this BAT again.
        echo.
        pause
        exit /b 1
    )
)
echo       Dependencies are ready.

echo.
echo [3/5] Preparing local server...

REM Stop only the process currently listening on port 8000.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8000 .*LISTENING" 2^>nul') do (
    echo       Stopping old server process PID %%P...
    taskkill /PID %%P /F >nul 2>&1
)

timeout /t 1 /nobreak >nul

REM Start THIS copy of server.py. Its SQLite database is located beside database.py.
echo       Starting server from:
echo       %~dp0server.py
start "SkillMatch AI Server" /min "%PYTHON%" "%~dp0server.py" 8000

if errorlevel 1 (
    echo.
    echo ERROR: Windows could not start Python.
    pause
    exit /b 1
)

echo.
echo [4/5] Waiting for SkillMatch AI server...
set "READY="
for /L %%N in (1,1,30) do (
    curl.exe --silent --show-error --fail --max-time 2 "http://127.0.0.1:8000/" >nul 2>&1
    if not errorlevel 1 (
        set "READY=1"
        goto SERVER_READY
    )
    timeout /t 1 /nobreak >nul
)

:SERVER_READY
if not defined READY (
    echo.
    echo ERROR: The SkillMatch AI server did not become ready within 30 seconds.
    echo.
    echo Try running this BAT again. If it still fails, open the server window
    echo and check the Python error shown there.
    pause
    exit /b 1
)

echo       Server is ready.
echo.
echo [5/5] Opening SkillMatch AI in Chrome...

set "CHROME="
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
    echo       Chrome: %CHROME%
    start "SkillMatch AI" "%CHROME%" --new-window "%URL%"
) else (
    echo       Chrome was not found at the standard locations.
    echo       Opening your default browser instead...
    start "SkillMatch AI" "%URL%"
)

echo.
echo ================================================
echo   SkillMatch AI is running successfully.
echo   URL: http://127.0.0.1:8000/
echo   Accounts are stored permanently in skillmatch.db.
echo ================================================
echo.
exit /b 0
