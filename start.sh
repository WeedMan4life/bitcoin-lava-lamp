#!/bin/bash
# Bitcoin Wallpaper - one-command launcher for a Raspberry Pi (or any
# Linux box) driving a small dedicated screen.
#
# Starts a local web server for this folder in the background, then
# opens Chromium in true fullscreen kiosk mode pointed at it.

cd "$(dirname "$0")"

# Start the server in the background, detached from this terminal.
python3 serve.py 8080 >/tmp/bitcoin-wallpaper-server.log 2>&1 &
echo $! > /tmp/bitcoin-wallpaper-server.pid

# Give the server a moment to start.
sleep 2

# --kiosk = fullscreen, no address bar/tabs/UI.
# --noerrdialogs --disable-infobars = suppress "restore session" etc.
# --incognito avoids a stale cached session interfering.
chromium-browser \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --incognito \
    --check-for-update-interval=31536000 \
    "http://localhost:8080"
