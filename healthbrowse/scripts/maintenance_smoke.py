"""Read-only public service probes. Use a trusted, public origin owned by the operator."""
import argparse
import json
import time
from datetime import date, datetime, timezone
from urllib.parse import urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Unexpected redirect on a monitored endpoint")


def probe(origin):
    url = urlsplit(origin)
    if (url.scheme != "https" or not url.hostname or url.username or url.password
            or url.path not in ("", "/") or url.query or url.fragment):
        raise ValueError("Set an HTTPS origin without credentials, path or query")
    opener = build_opener(NoRedirect())
    for path in ("/healthz", "/readyz", "/medline-topics.json"):
        start = time.monotonic()
        with opener.open(Request(origin.rstrip("/") + path, headers={"Accept": "application/json"}), timeout=20) as response:
            if response.status != 200:
                raise ValueError(f"{path} returned HTTP {response.status}")
            maximum = 4_000_000 if path.endswith(".json") else 32_000
            body = response.read(maximum + 1)
        if len(body) > maximum:
            raise ValueError(f"{path} response exceeds budget")
        data = json.loads(body)
        if not isinstance(data, dict):
            raise ValueError(f"{path} did not return a JSON object")
        if path.endswith(".json"):
            age = (datetime.now(timezone.utc).date() - date.fromisoformat(data["feedDate"])).days
            if not 0 <= age <= 14:
                raise ValueError(f"Published topic feed age is {age} days; investigate refresh/review")
        print(f"{path} OK {round(1000 * (time.monotonic() - start))}ms")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("origin")
    probe(parser.parse_args().origin)
