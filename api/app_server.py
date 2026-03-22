#!/usr/bin/env python3
"""Static file server with Cache-Control: no-cache headers. Port 8000."""

import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8000

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        pass  # Silence logs like the original setup

if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    server = HTTPServer(("", PORT), NoCacheHandler)
    print(f"App server running on http://localhost:{PORT} (no-cache)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()
