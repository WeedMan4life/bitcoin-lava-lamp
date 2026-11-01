#!/bin/bash
# Bitcoin Wallpaper - stops the background server started by start.sh.

if [ -f /tmp/bitcoin-wallpaper-server.pid ]; then
    PID=$(cat /tmp/bitcoin-wallpaper-server.pid)
    if kill "$PID" 2>/dev/null; then
        echo "Server stopped (PID $PID)."
    else
        echo "No running server found (it may already be stopped)."
    fi
    rm -f /tmp/bitcoin-wallpaper-server.pid
else
    echo "No server PID file found -- nothing to stop."
fi
