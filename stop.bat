@echo off
REM Bitcoin Wallpaper - stops the background server started by start.bat.
REM Exiting Chrome (Alt+F4) does NOT stop the server on its own -- run
REM this afterward, or just leave the server running for next time.

taskkill /FI "WINDOWTITLE eq BitcoinWallpaperServer*" /T /F >nul 2>&1

if %ERRORLEVEL%==0 (
    echo Server stopped.
) else (
    echo No running server found ^(it may already be stopped^).
)

pause
