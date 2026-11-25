#!/usr/bin/env python3
"""Turn a county tax-list lookup file into the public sidecar the parcel cards read.

Only parcels still in the published inventory are kept, and only parcel facts: zoning, last deed date and book/page,
recorded sale price and non-usable code, last year's taxes, land and building description, year built.

  python3 scripts/build_county_tax_list_facts.py --lookup private_build/ocean-tax-list.json
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEEP = ("zone", "deedDate", "deedBookPage", "salePrice", "nonusableCode", "lastYearTaxes", "landDescription", "buildingDescription", "yearBuilt")
BLANK = {"", "n/a", "na", "/", "0", "0.00"}


def build(lookup: dict, published: set[str], source_name: str, source_url: str) -> dict:
    records = {}
    for pin in sorted(lookup):
        v = lookup[pin]
        if pin not in published or v.get("status") != "found" or not str(v.get("url", "")).startswith("https://"):
            continue
        facts = {k: str(v["facts"].get(k) or "").strip() for k in KEEP}
        # The land description sometimes carries a business or person name after the size ("4.49AC EXAMPLE REALTY").
        # Only the size itself is published.
        size = re.match(r"\s*((?:[\d.,]+\s*(?:ACRES?|AC)\b\.?)|(?:[\d.]+\s*[Xx]\s*[\d.]+(?:\s*(?:IRR|AV))?))", facts["landDescription"], flags=re.I)
        facts["landDescription"] = size.group(1).strip() if size else ""
        facts = {k: x for k, x in facts.items() if x.lower() not in BLANK}
        if facts:
            records[pin] = {**facts, "url": v["url"], "retrievedAt": v.get("retrievedAt", "")}
    return {"format": "RadarCountyTaxListFacts", "version": 1, "source": {"name": source_name, "url": source_url},
            "caveat": "Parcel facts as published by the county Tax Board for one block and lot. No owner name is published there. A recorded sale price is not an asking price or a valuation.",
            "records": records}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--lookup", required=True)
    ap.add_argument("--csv", default=str(ROOT / "assets/data/nj-parcel-research.csv"))
    ap.add_argument("--out", default=str(ROOT / "assets/data/nj-county-tax-list-facts.json"))
    ap.add_argument("--source-name", default="Ocean County Board of Taxation tax list")
    ap.add_argument("--source-url", default="https://tax.co.ocean.nj.us/frmTaxBoardTaxListSearch")
    args = ap.parse_args(argv)
    published = {r["PAMS_PIN"] for r in csv.DictReader(open(args.csv, encoding="utf-8-sig"))}
    data = build(json.loads(Path(args.lookup).read_text()), published, args.source_name, args.source_url)
    Path(args.out).write_text(json.dumps(data, indent=1) + "\n")
    print(f"{len(data['records'])} parcels written to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
