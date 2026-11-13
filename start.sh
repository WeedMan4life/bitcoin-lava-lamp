#!/bin/bash
# Bitcoin Wallpaper - one-command launcher for a Raspberry Pi (or any
# Linux box) driving a small dedicated screen.
#
# Starts a local web server for this folder in the background, then
# opens Chromium in true fullscreen kiosk mode pointed at it.

cd "$(dirname "$0")"

# Keep the log + PID file in a private per-user folder rather than the
# shared, world-writable /tmp (where another user on the machine could
# pre-create or tamper with them).
RUN_DIR="${XDG_RUNTIME_DIR:-$HOME/.cache}/bitcoin-wallpaper"
mkdir -p "$RUN_DIR"
chmod 700 "$RUN_DIR"

# Start the server in the background, detached from this terminal.
python3 serve.py 8080 >"$RUN_DIR/server.log" 2>&1 &
echo $! > "$RUN_DIR/server.pid"

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
