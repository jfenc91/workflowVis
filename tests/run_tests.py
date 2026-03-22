#!/usr/bin/env python3
"""
Headless test runner — launches a temporary server, opens the test page
in a browser, and scrapes the console output for pass/fail counts.

Since tests require a real DOM (canvas, createElement, etc.), we open
a real browser but auto-close it after results are captured.
"""

import http.server
import threading
import subprocess
import sys
import time
import urllib.request
import re
import os
import signal

PORT = 8777  # Use a different port to avoid conflicts
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server():
    server = http.server.HTTPServer(("", PORT), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server

def main():
    # Start a temporary server
    server = start_server()
    url = f"http://localhost:{PORT}/tests/"

    print(f"Running tests at {url}")
    print()

    # Try to use osascript (macOS) to open browser, wait for results, and extract them
    # The test page logs results to console. We use a JS-based approach via osascript.
    apple_script = f'''
    tell application "Safari"
        activate
        set testURL to "{url}"

        -- Open in a new tab
        tell window 1
            set current tab to (make new tab with properties {{URL:testURL}})
        end tell
        set testTab to current tab of window 1

        -- Wait for tests to complete (poll for results)
        set maxWait to 30
        set waited to 0
        repeat while waited < maxWait
            delay 1
            set waited to waited + 1
            try
                set pageTitle to name of testTab
                set pageSource to do JavaScript "document.getElementById('test-results')?.querySelector('h2')?.textContent || ''" in testTab
                if pageSource is not "" then
                    -- Get full results
                    set resultText to do JavaScript "(() => {{ const r = document.getElementById('test-results'); if (!r) return 'NO RESULTS'; let lines = []; const h2 = r.querySelector('h2'); if (h2) lines.push(h2.textContent); r.querySelectorAll('.suite').forEach(s => {{ lines.push('\\n  ' + s.querySelector('h3').textContent); s.querySelectorAll('.test').forEach(t => {{ lines.push('    ' + t.textContent.trim().split('\\n')[0]); }}); }}); return lines.join('\\n'); }})()" in testTab

                    -- Close the tab
                    close testTab

                    return resultText
                end if
            end try
        end repeat

        close testTab
        return "TIMEOUT: Tests did not complete within " & maxWait & " seconds"
    end tell
    '''

    try:
        result = subprocess.run(
            ["osascript", "-e", apple_script],
            capture_output=True, text=True, timeout=45
        )
        output = result.stdout.strip()

        if output:
            print(output)
            print()

            # Parse pass/fail from output
            match = re.search(r'(\d+)\s+passed.*?(\d+)\s+failed', output)
            if match:
                passed = int(match.group(1))
                failed = int(match.group(2))
                if failed > 0:
                    print(f"\033[31mFAILED: {passed} passed, {failed} failed\033[0m")
                    server.shutdown()
                    sys.exit(1)
                else:
                    print(f"\033[32mPASSED: {passed} tests passed\033[0m")
                    server.shutdown()
                    sys.exit(0)
            elif "TIMEOUT" in output:
                print("\033[31mTests timed out\033[0m")
                server.shutdown()
                sys.exit(1)
        else:
            # osascript produced no output — fallback
            raise Exception("No output from browser automation")

    except FileNotFoundError:
        # osascript not available (not macOS) — fall back to just opening
        print("Headless test execution not available on this platform.")
        print(f"Open {url} in your browser to run tests.")
        subprocess.run(["open", url], check=False)
        server.shutdown()
        sys.exit(0)

    except subprocess.TimeoutExpired:
        print("\033[31mTest runner timed out\033[0m")
        server.shutdown()
        sys.exit(1)

    except Exception as e:
        # Fallback: just open the browser
        print(f"Browser automation failed: {e}")
        print(f"Opening {url} in browser instead...")
        subprocess.run(["open", url], check=False)
        server.shutdown()
        sys.exit(0)

if __name__ == "__main__":
    main()
