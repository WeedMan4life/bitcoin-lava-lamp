@echo off
REM Bitcoin Wallpaper - one-click launcher
REM Starts a local web server for this folder, then opens Chrome in
REM fullscreen kiosk mode pointed at it. Double-click this file to run.

cd /d "%~dp0"

REM Start the server in its own minimized window so it keeps running in
REM the background. The window is titled "BitcoinWallpaperServer" so it
REM can be found and closed later (see stop.bat).
start "BitcoinWallpaperServer" /min cmd /c "python serve.py 8080"

REM Give the server a moment to start before the browser requests it.
timeout /t 2 /nobreak >nul

REM --kiosk = true fullscreen, no address bar/tabs/UI at all.
REM Press Alt+F4 to exit kiosk mode.
start chrome --kiosk "http://localhost:8080"
