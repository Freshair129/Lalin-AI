"""Exercise the Windows smoke gate with a real local HTTP process."""
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "win32" or not shutil.which("pwsh"), reason="Windows PowerShell required")
SCRIPT = Path(__file__).resolve().parents[3] / "tools" / "build" / "smoke_sidecar.ps1"


def run_gate(tmp_path, response, delay=0, timeout=8):
    server = tmp_path / "server.py"
    server.write_text("""import http.server, sys, time
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  time.sleep(float(sys.argv[3]))
  self.send_response(200); self.end_headers(); self.wfile.write(b'{"status":"ok","service":"g-music"}' if sys.argv[2] == "good" else b'{"status":"wrong"}')
 def log_message(self, *args): pass
http.server.HTTPServer((\"127.0.0.1\", int(sys.argv[1])), Handler).serve_forever()
""")
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return subprocess.run(["pwsh", "-NoProfile", "-File", str(SCRIPT), "-Executable", sys.executable,
      "-Arguments", f"{server} {port} {response} {delay}", "-Port", str(port), "-TimeoutSeconds", str(timeout),
      "-LogDirectory", str(tmp_path)], capture_output=True, text=True, timeout=25)


def test_slow_health_response_is_accepted(tmp_path):
    result = run_gate(tmp_path, "good", 3)
    assert result.returncode == 0, result.stdout + result.stderr


def test_wrong_health_response_fails(tmp_path):
    result = run_gate(tmp_path, "bad")
    assert result.returncode != 0, result.stdout + result.stderr



def test_health_can_use_full_deadline(tmp_path):
    result = run_gate(tmp_path, "good", 11, timeout=18)
    assert result.returncode == 0, result.stdout + result.stderr


def test_health_after_deadline_fails(tmp_path):
    result = run_gate(tmp_path, "good", 4, timeout=2)
    assert result.returncode != 0, result.stdout + result.stderr


def test_response_from_unrelated_listener_fails(tmp_path):
    import http.server
    import threading
    import time

    sleeper = tmp_path / "sleeper.py"
    marker = tmp_path / "started"
    sleeper.write_text(f"from pathlib import Path; import time; Path({str(marker)!r}).touch(); time.sleep(20)")
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"status":"ok","service":"g-music"}')

        def log_message(self, *args):
            pass

    def serve_later():
        nonlocal server
        for _ in range(200):
            if marker.exists():
                break
            time.sleep(0.05)
        server = http.server.HTTPServer(("127.0.0.1", port), Handler)
        server.serve_forever()

    server = None
    thread = threading.Thread(target=serve_later, daemon=True)
    thread.start()
    try:
        result = subprocess.run(["pwsh", "-NoProfile", "-File", str(SCRIPT), "-Executable", sys.executable,
            "-Arguments", str(sleeper), "-Port", str(port), "-TimeoutSeconds", "5",
            "-LogDirectory", str(tmp_path)], capture_output=True, text=True, timeout=20)
        assert result.returncode != 0, result.stdout + result.stderr
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()
        thread.join(timeout=3)
