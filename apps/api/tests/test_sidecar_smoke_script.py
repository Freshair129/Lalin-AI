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


def run_gate(tmp_path, response, delay=0):
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
      "-Arguments", f"{server} {port} {response} {delay}", "-Port", str(port), "-TimeoutSeconds", "8",
      "-LogDirectory", str(tmp_path)], capture_output=True, text=True, timeout=25)


def test_slow_health_response_is_accepted(tmp_path):
    result = run_gate(tmp_path, "good", 3)
    assert result.returncode == 0, result.stdout + result.stderr


def test_wrong_health_response_fails(tmp_path):
    result = run_gate(tmp_path, "bad")
    assert result.returncode != 0, result.stdout + result.stderr

