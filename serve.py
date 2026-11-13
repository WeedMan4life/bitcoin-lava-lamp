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

Usage: python serve.py [port] [host]
(defaults to port 8080 on 127.0.0.1).

Security: by default this only listens on 127.0.0.1, i.e. it is
reachable from this computer only, not from other devices on your
network. The folder it serves contains config.local.js (your node's
address), so that's the safe default. If you really do want another
device to load the page from this one, pass a host explicitly, e.g.
`python serve.py 8080 0.0.0.0` -- and understand that everything in
this folder is then visible to your whole network.
"""
import os
import sys
import http.server
import socketserver
import urllib.parse

# When started with pythonw (no console window, e.g. from a Windows
# Startup shortcut), sys.stdout/sys.stderr are None. The server logs
# every request to stderr, so without this each request would crash
# and the browser would get an empty response.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")


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


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"

    with ThreadingHTTPServer((host, port), Handler) as httpd:
        print(f"Serving HTTP on {host} port {port} (threaded) ...")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
