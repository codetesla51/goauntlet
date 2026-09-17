#!/usr/bin/env python3
"""Serve goauntlet statically + proxy Go compilation.

Why a proxy: the Go playground compile API (https://go.dev/_/compile) sends
no CORS headers, so browsers refuse to call it directly. Same-origin
POST /api/compile forwards server-to-server and returns the result as JSON.

Usage:  npm run serve   (or: python3 scripts/serve.py [port])
"""
import json
import sys
import urllib.parse
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = __file__.rsplit("/scripts/", 1)[0] or "."
UPSTREAM = "https://go.dev/_/compile"
# The Go sandbox is usually fast but can stall ~60s on slow networks.
# The browser waits up to 90s (see lesRun), so the proxy must outlast it.
UPSTREAM_TIMEOUT = 80
MAX_CODE = 64 * 1024


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Learning app: content edits must show on reload. Never cache our files.
        if self.command == "GET":
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/compile":
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
        except ValueError:
            n = 0
        if n > MAX_CODE + 4096:
            self.send_error(413, "Program too big")
            return
        try:
            payload = json.loads(self.rfile.read(max(n, 0)) or b"{}")
        except (ValueError, OSError):
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        code = payload.get("code", "")
        if not isinstance(code, str) or not code.strip():
            self._json(400, {"ok": False, "error": "Empty program."})
            return
        if len(code) > MAX_CODE:
            self._json(400, {"ok": False, "error": "Program too big (64KB max)."})
            return
        try:
            form = urllib.parse.urlencode({"version": "2", "body": code}).encode()
            req = urllib.request.Request(UPSTREAM, data=form, method="POST")
            with urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT) as res:
                up = json.loads(res.read().decode("utf-8", "replace"))
        except TimeoutError:
            sys.stderr.write("compile: upstream timed out after %ds\n" % UPSTREAM_TIMEOUT)
            self._json(
                502,
                {
                    "ok": False,
                    "error": "Go sandbox timed out (>%ds). Try Run again, or use the "
                    "Playground button." % UPSTREAM_TIMEOUT,
                },
            )
            return
        except Exception as exc:  # network down, upstream sick…
            sys.stderr.write("compile: upstream %s\n" % exc.__class__.__name__)
            self._json(
                502,
                {
                    "ok": False,
                    "error": "Go servers unreachable (%s). Check your connection "
                    "or use the Playground button." % exc.__class__.__name__,
                },
            )
            return
        events = up.get("Events") or [] if isinstance(up, dict) else []
        out = "".join(
            e.get("Message", "")
            for e in events
            if isinstance(e, dict) and isinstance(e.get("Message", ""), str) and e.get("Kind") in ("stdout", "stderr")
        )
        self._json(
            200,
            {
                "ok": True,
                "errors": up.get("Errors") or "" if isinstance(up, dict) else "",
                "output": out,
            },
        )

    def _json(self, status, obj):
        try:
            body = json.dumps(obj).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # client went away (navigated, timed out) — nothing to do

    def log_message(self, fmt, *args):  # keep the terminal readable
        if self.path.startswith("/api/"):
            sys.stderr.write("compile %s\n" % self.path)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    srv = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=ROOT))
    print("goauntlet on http://localhost:%d  (static + /api/compile)" % port)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
