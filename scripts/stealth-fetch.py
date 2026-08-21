#!/usr/bin/env python3
"""Thin stealthy browser GET. Reads URLs (one per line) on stdin, prints a JSON
array of {url, status, body, error} on stdout. ONE StealthySession for the whole
batch (browser reuse). No parsing — that lives in TypeScript."""
import sys, json

def main() -> int:
    try:
        from scrapling.fetchers import StealthySession
    except Exception as e:  # import/env failure = tool broken, not a per-URL error
        print(f"scrapling import failed: {e}", file=sys.stderr)
        return 1

    urls = [ln.strip() for ln in sys.stdin if ln.strip()]
    out = []
    try:
        with StealthySession(headless=True) as s:
            for url in urls:
                try:
                    p = s.fetch(url)
                    body = p.body
                    if isinstance(body, (bytes, bytearray)):  # StealthySession returns bytes
                        body = body.decode("utf-8", "replace")
                    out.append({"url": url, "status": int(p.status or 0),
                                "body": body or "", "error": None})
                except Exception as e:
                    out.append({"url": url, "status": 0, "body": "", "error": str(e)})
    except Exception as e:  # browser could not launch at all
        print(f"StealthySession failed to start: {e}", file=sys.stderr)
        return 1

    json.dump(out, sys.stdout)
    return 0

if __name__ == "__main__":
    sys.exit(main())
