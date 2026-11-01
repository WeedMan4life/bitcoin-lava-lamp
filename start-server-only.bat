@echo off
REM Bitcoin Wallpaper - server-only launcher, for use as a desktop
REM wallpaper via Lively Wallpaper (rocksdanister.com/lively).
REM
REM Point Lively at "Website" -> http://localhost:8080 rather than
REM loading index.html directly -- the app uses ES modules, which
REM browsers refuse to load from a raw local file:// path, so it needs
REM to be served over real http:// even for a wallpaper.
REM
REM Fully silent: starts the server minimized in the background and
REM exits immediately, so this is also safe to run from Windows
REM Startup without leaving a window waiting for a keypress.

cd /d "%~dp0"
start "BitcoinWallpaperServer" /min cmd /c "python serve.py 8080"
exit
