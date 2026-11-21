@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
    python "%~dp0run_local.py"
) else (
    py -3 "%~dp0run_local.py"
)
if errorlevel 1 (
    echo To run this app, install Python or open index.html with VS Code Live Server.
)
pause
