#!/usr/bin/env python3
"""Run the local shared-visit demo without reading/overwriting backend/.env credentials."""
import argparse
import base64
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import time
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--public-host', default='127.0.0.1', help='Mac LAN IPv4 address for a real phone, e.g. 192.168.0.5')
parser.add_argument('--api-port', type=int, default=8080)
parser.add_argument('--web-port', type=int, default=8081)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
node = shutil.which('node')
if not node or not (root / 'backend/dist/main.js').exists():
    parser.exit(1, 'Install Node.js 22+, then run npm ci && npm run build in backend/.\n')
for port in [args.api_port, args.web_port]:
    with socket.socket() as sock:
        try: sock.bind(('0.0.0.0', port))
        except OSError: parser.exit(1, f'Port {port} is already in use. Stop the previous demo or choose other ports.\n')
state = root / '.tools/shared-demo'
state.mkdir(parents=True, exist_ok=True)
key = state / 'token-key'
if not key.exists():
    fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f: f.write(base64.b64encode(secrets.token_bytes(32)).decode())
web_url = f'http://{args.public_host}:{args.web_port}'
api_env = os.environ.copy()
api_env.update({
    'NODE_ENV': 'development', 'PORT': str(args.api_port), 'DATABASE_URL': '',
    'DATABASE_PATH': str(state / 'db'), 'TOKEN_ENCRYPTION_KEY': key.read_text().strip(),
    'CORS_ORIGINS': web_url, 'VENUE_CATALOG_PATH': str(root / 'contracts/oryong-demo.json'),
})
web_env = os.environ.copy()
web_env.update({'PORT': str(args.web_port), 'HOST': '0.0.0.0', 'API_BASE_URL': f'http://127.0.0.1:{args.api_port}'})
children = []

def stop(*_):
    for child in children:
        if child.poll() is None: child.terminate()
    for child in children:
        try: child.wait(timeout=10)
        except subprocess.TimeoutExpired: child.kill()
    raise SystemExit(0)

signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)
try:
    children.append(subprocess.Popen([node, 'dist/main.js'], cwd=root / 'backend', env=api_env,
        stdout=(state / 'backend.log').open('ab'), stderr=subprocess.STDOUT))
    children.append(subprocess.Popen([node, 'server.mjs'], cwd=root / 'companion', env=web_env,
        stdout=(state / 'web.log').open('ab'), stderr=subprocess.STDOUT))
    for attempt in range(30):
        if any(child.poll() is not None for child in children): raise RuntimeError('Service exited; inspect .tools/shared-demo/*.log')
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{args.api_port}/health', timeout=1): break
        except OSError: time.sleep(1)
    else: raise RuntimeError('Backend health check timed out')
    print(f'Demo ready. Companion: {web_url}', flush=True)
    print(f'Android build: ARRIVAL_API_BASE_URL=http://10.0.2.2:{args.api_port}', flush=True)
    print(f'Android build: ARRIVAL_COMPANION_BASE_URL={web_url}', flush=True)
    print('Use the same Wi-Fi for Mac and phone. Ctrl+C stops both services. Local demo only; deployment requires HTTPS.', flush=True)
    while all(child.poll() is None for child in children): time.sleep(1)
finally:
    for child in children:
        if child.poll() is None: child.terminate()
