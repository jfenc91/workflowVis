#!/usr/bin/env python3
"""Run tests in headless Chrome and capture results via CDP."""

import json
import subprocess
import sys
import time
import urllib.request
import websocket  # may need: pip3 install websocket-client

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL = "http://localhost:8080/tests/index.html"

def run():
    # Launch Chrome headless with remote debugging
    proc = subprocess.Popen([
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--remote-debugging-port=9222",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    time.sleep(2)

    try:
        # Get WebSocket URL from CDP
        resp = urllib.request.urlopen("http://localhost:9222/json")
        targets = json.loads(resp.read())
        ws_url = targets[0]["webSocketDebuggerUrl"]

        ws = websocket.create_connection(ws_url)

        # Navigate to test page
        ws.send(json.dumps({
            "id": 1,
            "method": "Page.navigate",
            "params": {"url": URL}
        }))
        ws.recv()

        # Wait for tests to complete
        time.sleep(5)

        # Get test results from DOM
        ws.send(json.dumps({
            "id": 2,
            "method": "Runtime.evaluate",
            "params": {
                "expression": "document.getElementById('test-results').innerText",
                "returnByValue": True
            }
        }))
        result = json.loads(ws.recv())
        text = result.get("result", {}).get("result", {}).get("value", "No output")
        print(text)

        ws.close()
    except Exception as e:
        print(f"CDP approach failed: {e}", file=sys.stderr)
        print("Falling back to virtual-time-budget approach...", file=sys.stderr)

        # Fallback: use --virtual-time-budget with dump-dom
        proc.terminate()
        proc.wait()

        result = subprocess.run([
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--virtual-time-budget=30000",
            "--dump-dom",
            URL,
        ], capture_output=True, text=True, timeout=60)

        # Parse test results from HTML
        import re
        html = result.stdout
        # Extract text content
        text = re.sub(r'<[^>]+>', '\n', html)
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        for line in lines:
            if any(kw in line for kw in ['passed', 'failed', '✔', '✘', 'Error', 'Test Results']):
                print(line)
    finally:
        proc.terminate()
        proc.wait()

if __name__ == "__main__":
    run()
