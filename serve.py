#!/usr/bin/env python3
"""
Bitcoin Wallpaper - threaded static file server.

Python's built-in `python -m http.server` handles one request at a
time. That's normally fine, but if two browser instances request the
page at nearly the same moment -- e.g. Lively Wallpaper initializing
two monitors' webviews simultaneously -- the second one can get
queued or dropped while the first is still being served, showing up
as an unstyled/broken page load on one screen. This uses Python's
own ThreadingHTTPServer instead, which serves concurrent requests
properly.

Usage: python serve.py [port] [host] [--open | --no-browser]
(defaults to port 8080 on 127.0.0.1).

It always serves the folder this file lives in, whatever directory you
run it from. `--open` also opens the page in your default browser.

Security: by default this only listens on 127.0.0.1, i.e. it is
reachable from this computer only, not from other devices on your
network. The folder it serves contains config.local.js (your node's
address), so that's the safe default. If you really do want another
device to load the page from this one, pass a host explicitly, e.g.
`python serve.py 8080 0.0.0.0` -- and understand that everything in
this folder is then visible to your whole network.

This same file is also what the Windows download (BitcoinWallpaper.exe)
runs: PyInstaller bundles it together with the app's files into one
.exe. In that "frozen" mode it opens the browser by default and prints
a short "how to stop" message instead of a request log.
"""
import functools
import os
import sys
import threading
import time
import webbrowser
import http.server
import socketserver
import urllib.parse

FROZEN = getattr(sys, "frozen", False)  # True inside the bundled .exe

# When started with pythonw (no console window, e.g. from a Windows
# Startup shortcut), sys.stdout/sys.stderr are None. The server logs
# every request to stderr, so without this each request would crash
# and the browser would get an empty response.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")


def say(*args):
    # flush=True so messages appear immediately even when output is
    # being captured rather than shown in a console window.
    print(*args, flush=True)


def app_dir():
    """Folder containing index.html and friends."""
    if FROZEN:
        # PyInstaller unpacks the bundled files to a temp folder and
        # records its path here.
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static file handler that won't hand out hidden files or listings."""

    def send_head(self):
        # Never serve dot-files or dot-folders (.git, .gitignore, ...).
        # The app itself doesn't need any of them.
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        parts = path.replace("\\", "/").split("/")
        if any(part.startswith(".") for part in parts if part):
            self.send_error(404, "File not found")
            return None
        return super().send_head()

    def list_directory(self, path):
        # No auto-generated folder listings.
        self.send_error(404, "File not found")
        return None

    def log_message(self, format, *args):
        # The .exe's window is for humans; skip the per-request log there.
        if not FROZEN:
            super().log_message(format, *args)


def main():
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    positional = [a for a in sys.argv[1:] if not a.startswith("--")]

    port = int(positional[0]) if len(positional) > 0 else 8080
    host = positional[1] if len(positional) > 1 else "127.0.0.1"
    open_browser = ("--open" in flags or FROZEN) and "--no-browser" not in flags

    url = f"http://localhost:{port}"
    handler = functools.partial(Handler, directory=app_dir())

    try:
        httpd = ThreadingHTTPServer((host, port), handler)
    except OSError:
        # Almost always: it's already running (e.g. double-clicked twice).
        say(f"Port {port} is already in use -- Bitcoin Wallpaper is "
              f"probably already running.")
        if open_browser:
            say(f"Opening {url} ...")
            webbrowser.open(url)
            time.sleep(4)
        return

    with httpd:
        if FROZEN:
            say("Bitcoin Wallpaper is running.")
            say()
            say(f"    {url}")
            say()
            say("Keep this window open (minimise it if you like).")
            say("Close it to stop Bitcoin Wallpaper.")
        else:
            say(f"Serving HTTP on {host} port {port} (threaded) ...")
        if open_browser:
            threading.Timer(0.6, webbrowser.open, args=(url,)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
