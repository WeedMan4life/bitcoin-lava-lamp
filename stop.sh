#!/bin/bash
# Bitcoin Wallpaper - stops the background server started by start.sh.

RUN_DIR="${XDG_RUNTIME_DIR:-$HOME/.cache}/bitcoin-wallpaper"
PID_FILE="$RUN_DIR/server.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill "$PID" 2>/dev/null; then
        echo "Server stopped (PID $PID)."
    else
        echo "No running server found (it may already be stopped)."
    fi
    rm -f "$PID_FILE"
else
    echo "No server PID file found -- nothing to stop."
fi
