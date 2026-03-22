#!/usr/bin/env python3
"""Fake data API server for dataset preview/download. Stdlib only, port 8001."""

import json
import csv
import io
import random
import string
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import date, timedelta

PORT = 8001

# --- Fake data generators ---

def gen_sequential(i):
    return i + 1

def gen_email(i):
    names = ["alice", "bob", "carol", "dave", "eve", "frank", "grace", "hank",
             "iris", "jack", "kate", "leo", "mia", "nick", "olivia", "pat"]
    domains = ["example.com", "test.org", "mail.co", "demo.io"]
    return f"{random.choice(names)}{i}@{random.choice(domains)}"

def gen_name(i):
    firsts = ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Hank",
              "Iris", "Jack", "Kate", "Leo", "Mia", "Nick", "Olivia", "Pat"]
    lasts = ["Smith", "Jones", "Brown", "Davis", "Wilson", "Taylor", "Clark",
             "Hall", "Lewis", "Young", "King", "Wright", "Green", "Adams"]
    return f"{random.choice(firsts)} {random.choice(lasts)}"

def gen_status(i):
    return random.choice(["active", "inactive", "pending", "archived"])

def gen_country(i):
    return random.choice(["US", "UK", "CA", "DE", "FR", "JP", "AU", "BR", "IN", "MX"])

def gen_boolean(i):
    return random.choice([True, False])

def gen_int(i):
    return random.randint(1, 100000)

def gen_float(precision, scale):
    def _gen(i):
        int_digits = precision - scale
        max_val = 10 ** int_digits
        return round(random.uniform(0, max_val), scale)
    return _gen

def gen_words(i):
    vocab = ["data", "pipeline", "workflow", "analytics", "transform", "load",
             "extract", "query", "table", "record", "batch", "stream", "sync",
             "merge", "filter", "aggregate", "partition", "snapshot", "delta"]
    count = random.randint(2, 5)
    return " ".join(random.choices(vocab, k=count))

def gen_date(i):
    base = date(2024, 1, 1)
    offset = random.randint(0, 730)
    return (base + timedelta(days=offset)).isoformat()

def gen_timestamp(i):
    d = gen_date(i)
    h = random.randint(0, 23)
    m = random.randint(0, 59)
    s = random.randint(0, 59)
    return f"{d}T{h:02d}:{m:02d}:{s:02d}Z"

def gen_uuid(i):
    return f"{_hex(8)}-{_hex(4)}-4{_hex(3)}-{random.choice('89ab')}{_hex(3)}-{_hex(12)}"

def _hex(n):
    return ''.join(random.choices('0123456789abcdef', k=n))

def gen_phone(i):
    return f"+1-{random.randint(200,999)}-{random.randint(100,999)}-{random.randint(1000,9999)}"

def gen_url(i):
    paths = ["products", "users", "orders", "api", "docs", "items"]
    return f"https://example.com/{random.choice(paths)}/{random.randint(1, 9999)}"

def gen_amount(i):
    return round(random.uniform(1.0, 9999.99), 2)


def get_generator(field_name, field_type):
    """Pick a generator: name heuristics first, then type fallback."""
    name = field_name.lower()

    # Name heuristics
    if name.endswith("_id") or name == "id":
        return gen_sequential
    if "email" in name:
        return gen_email
    if name in ("name", "full_name", "fullname", "customer_name", "user_name", "username"):
        return gen_name
    if name in ("first_name", "firstname", "last_name", "lastname"):
        return lambda i: gen_name(i).split()[0 if "first" in name else -1]
    if "status" in name:
        return gen_status
    if "country" in name:
        return gen_country
    if "phone" in name:
        return gen_phone
    if "url" in name or "link" in name:
        return gen_url
    if "uuid" in name:
        return gen_uuid
    if "amount" in name or "price" in name or "cost" in name or "total" in name:
        return gen_amount

    # Type fallback
    t = field_type.upper() if field_type else ""

    if "BOOL" in t:
        return gen_boolean
    if t in ("BIGINT", "INT", "INTEGER", "SMALLINT", "TINYINT"):
        return gen_int

    # NUMERIC(p,s) / DECIMAL(p,s)
    m = re.match(r'(?:NUMERIC|DECIMAL)\((\d+),\s*(\d+)\)', t)
    if m:
        return gen_float(int(m.group(1)), int(m.group(2)))
    if "FLOAT" in t or "DOUBLE" in t or "NUMERIC" in t or "DECIMAL" in t:
        return gen_float(10, 2)

    if "DATE" in t and "TIME" not in t:
        return gen_date
    if "TIMESTAMP" in t or "DATETIME" in t:
        return gen_timestamp

    # Default: words for text types, int for others
    if "CHAR" in t or "TEXT" in t or "STRING" in t:
        return gen_words

    return gen_int


def generate_rows(fields, count):
    generators = [(f["name"], get_generator(f["name"], f.get("type", ""))) for f in fields]
    rows = []
    for i in range(count):
        row = []
        for name, gen in generators:
            val = gen(i)
            row.append(val)
        rows.append(row)
    return rows


class DataHandler(BaseHTTPRequestHandler):
    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return None
        return json.loads(self.rfile.read(length))

    def do_POST(self):
        if self.path == "/api/preview":
            self._handle_preview()
        elif self.path == "/api/download":
            self._handle_download()
        elif self.path == "/api/download-json":
            self._handle_download_json()
        else:
            self.send_response(404)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(b'{"error":"not found"}')

    def _handle_preview(self):
        body = self._read_body()
        if not body or "fields" not in body:
            self.send_response(400)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(b'{"error":"fields required"}')
            return

        fields = body["fields"]
        columns = [f["name"] for f in fields]
        rows = generate_rows(fields, 50)

        result = json.dumps({
            "columns": columns,
            "rows": rows,
            "totalAvailable": 1000,
        })

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(result.encode())

    def _handle_download(self):
        body = self._read_body()
        if not body or "fields" not in body:
            self.send_response(400)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(b'{"error":"fields required"}')
            return

        fields = body["fields"]
        columns = [f["name"] for f in fields]
        rows = generate_rows(fields, 1000)

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(columns)
        writer.writerows(rows)

        csv_bytes = buf.getvalue().encode()
        dataset_name = body.get("datasetName", "dataset")
        filename = f"{dataset_name}.csv"

        self.send_response(200)
        self.send_header("Content-Type", "text/csv")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self._cors_headers()
        self.end_headers()
        self.wfile.write(csv_bytes)

    def _handle_download_json(self):
        body = self._read_body()
        if not body or "fields" not in body:
            self.send_response(400)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(b'{"error":"fields required"}')
            return

        fields = body["fields"]
        columns = [f["name"] for f in fields]
        rows = generate_rows(fields, 1000)
        dataset_name = body.get("datasetName", "dataset")

        # JSONL format: one JSON object per line
        lines = []
        for row in rows:
            obj = {col: val for col, val in zip(columns, row)}
            lines.append(json.dumps(obj))
        json_bytes = ("\n".join(lines) + "\n").encode()

        ext = ".jsonl" if dataset_name.endswith(".jsonl") else ".json"
        filename = dataset_name if dataset_name.endswith(ext) else dataset_name + ext

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self._cors_headers()
        self.end_headers()
        self.wfile.write(json_bytes)

    def log_message(self, format, *args):
        print(f"[data_server] {args[0]}")


if __name__ == "__main__":
    server = HTTPServer(("", PORT), DataHandler)
    print(f"Data API server running on http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()
