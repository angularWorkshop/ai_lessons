"""Serve the tiny classifier on loopback only. No model downloads or cloud calls."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from train import load_model, predict


def make_server(model, port=8765):
    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, body):
            payload = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            self.reply(200, {"ready": True, "kind": model["kind"]}) if self.path == "/health" else self.reply(404, {"error": "Not found"})

        def do_POST(self):
            if self.path != "/predict":
                self.reply(404, {"error": "Not found"})
                return
            if self.headers.get("Origin"):
                self.reply(403, {"error": "Use a local CLI, not a browser origin"})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 8192:
                    raise ValueError("Request must be 1..8192 bytes")
                body = json.loads(self.rfile.read(size))
                text = body.get("text") if isinstance(body, dict) else None
                if not isinstance(text, str) or not text.strip() or len(text) > 2000:
                    raise ValueError("Provide 1..2000 characters of text")
                self.reply(200, predict(model, text))
            except (ValueError, UnicodeError):
                self.reply(400, {"error": "Invalid JSON or text length"})

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.timeout = 5
    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=Path(__file__).with_name("model.json"))
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = make_server(load_model(args.model), args.port)
    print(f"Local classifier: http://127.0.0.1:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
