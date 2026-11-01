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

Usage is identical to the built-in server: python serve.py [port]
(defaults to 8080).
"""
import sys
import http.server
import socketserver


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = http.server.SimpleHTTPRequestHandler

    with ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"Serving HTTP on :: port {port} (threaded) ...")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
