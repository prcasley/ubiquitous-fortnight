#!/usr/bin/env python3
"""Read the assessment owner name from the county tax-list search for parcels whose county publishes that search.

One request per parcel, one every two seconds by default. The site stops answering after a few hundred
requests in a short period, so the script stops on the first empty page and resumes on the next run. Counties covered are listed in nj_carrier_rematch.COUNTY_SEARCH_PUBLISHED.
The name is the county tax list's assessment owner as of the date the page states. It is not a deed or title search.
Output (default .radar/rematch/out/county-owners.json) stays out of the public site.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nj_carrier_rematch as R  # noqa: E402


def cells(row: str) -> list[str]:
    return [html.unescape(re.sub(r"<[^>]+>", "", c)).replace("\xa0", " ").strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S | re.I)]


def parse(page: str, block: str, lot: str, qualifier: str) -> dict:
    """Exactly one row with the same block, lot and qualifier, or no owner at all."""
    as_of = re.search(r"Data as of\s*([0-9/]+)", page)
    rows = [cells(r) for r in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S | re.I)]
    rows = [c[1:] if c and c[0].startswith("More Info") else c for c in rows]
    records = [c for c in rows if len(c) >= 6 and c[0] not in ("Block", "")]
    exact = [c for c in records if c[0] == block and c[1] == lot and c[2] == qualifier]
    found = len(exact) == 1
    return {"status": "found" if found else ("ambiguous" if records else "not-found"), "owner": exact[0][5] if found else "",
            "class": exact[0][3] if found else "", "location": exact[0][4] if found else "", "candidates": len(records),
            "dataAsOf": as_of.group(1) if as_of else None}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--parcels", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--delay", type=float, default=2.0)
    args = ap.parse_args(argv)
    todo = [p for p in json.loads(Path(args.parcels).read_text()) if not p.get("missing") and R.county_record_link(p)["kind"] == "prefilled"]
    out_path = Path(args.out)
    out = json.loads(out_path.read_text()) if out_path.exists() else {}
    failures = 0
    for p in todo:
        if out.get(p["PAMS_PIN"], {}).get("status") in ("found", "ambiguous", "not-found"):
            continue
        url = R.county_record_link(p)["url"]
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (property research; one lookup per parcel)"}), timeout=40) as r:
                page = r.read().decode("utf-8", "replace")
            if not page.strip():  # the site answers with an empty page when it stops serving a client
                print("County search returned an empty page; stopping. Rerun later to resume.")
                break
            out[p["PAMS_PIN"]] = dict(parse(page, str(p["PCLBLOCK"]).strip(), str(p["PCLLOT"]).strip(), str(p.get("PCLQCODE") or "").strip()), url=url)
        except Exception as exc:
            failures += 1
            out[p["PAMS_PIN"]] = {"status": "error", "message": str(exc)[:120], "url": url}
            if failures > 8:
                print("Stopping after repeated errors; rerun to resume.")
                break
        time.sleep(args.delay)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=1))
    print(f"{len(todo)} parcels in covered counties; found {sum(1 for v in out.values() if v['status'] == 'found')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
