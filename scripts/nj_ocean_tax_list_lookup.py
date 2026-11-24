#!/usr/bin/env python3
"""Read published parcel facts from Ocean County's Tax Board tax list search (https://tax.co.ocean.nj.us/).

The county's public detail page gives zoning, the last recorded deed (date, book/page, sale price, non-usable code),
last year's taxes, the land description and the assessment. It does not publish the owner's name, so this adds parcel
facts only: no person, phone or email. One search and one detail request per parcel, two seconds apart, resumable.

  python3 scripts/nj_ocean_tax_list_lookup.py --csv assets/data/nj-parcel-research.csv --out private_build/ocean-tax-list.json
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import time
import urllib.parse
import urllib.request
import http.cookiejar
from pathlib import Path

BASE = "https://tax.co.ocean.nj.us/"
SEARCH = BASE + "frmTaxBoardTaxListSearch"
LABELS = {"Deed date": "deedDate", "Zone": "zone", "Book/page": "deedBookPage", "Sale price": "salePrice", "Nonusable code": "nonusableCode",
          "Last yr taxes": "lastYearTaxes", "Land desc": "landDescription", "Bldg desc": "buildingDescription", "Year blt": "yearBuilt",
          "Land val": "landValue", "Improvement val": "improvementValue", "Net value": "netValue", "Prop class": "propertyClass",
          "Location": "location", "Addtl lots": "additionalLots", "Facility": "facility", "Type/use": "typeUse"}


def lines_of(page: str) -> list[str]:
    start = page.find("Tax List Details")
    text = re.sub(r"<(script|style).*?</\1>", "", page[max(start, 0):], flags=re.S | re.I)
    text = re.sub(r"</(td|th|div|span|tr|li|p|h\d)>", "\n", text, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    return [x for x in (re.sub(r"\s+", " ", line).strip() for line in text.split("\n")) if x]


def parse_detail(page: str) -> dict:
    """Label/value pairs from the "Tax List Details - Current Year" block. A label followed by another label is blank."""
    rows = lines_of(page)
    end = rows.index("Assessment History") if "Assessment History" in rows else len(rows)
    out = {}
    for i, row in enumerate(rows[:end]):
        key = LABELS.get(row.rstrip(":"))
        if not key or not row.endswith(":") or key in out:
            continue
        value = rows[i + 1] if i + 1 < end else ""
        out[key] = "" if value.endswith(":") or value in ("n/a", "NA / NA") else value
    return out


def find_detail_link(page: str, block: str, lot: str, qual: str) -> str | None:
    """The result row whose block, lot and qualifier match exactly; None when there is no single match."""
    hits = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, flags=re.S | re.I):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).replace("\xa0", " ").strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S | re.I)]
        link = re.search(r'href="(frmTaxBoardTaxListDetail\.aspx\?ID=[0-9A-Fa-f-]+)"', row)
        if link and len(cells) >= 5 and cells[2] == block and cells[3] == lot and (cells[4] or "") == (qual or ""):
            hits.append(link.group(1))
    return hits[0] if len(set(hits)) == 1 else None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--csv", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--delay", type=float, default=2.0)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args(argv)
    todo = [r for r in csv.DictReader(open(args.csv, encoding="utf-8-sig")) if r["COUNTY"].upper() == "OCEAN" and re.fullmatch(r"15\d{2}_.+_.+", r["PAMS_PIN"])]
    out_path = Path(args.out)
    out = json.loads(out_path.read_text()) if out_path.exists() else {}
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.addheaders = [("User-Agent", "Mozilla/5.0 (property research; one parcel every few seconds)")]
    get = lambda url, data=None: opener.open(urllib.request.Request(url, data=data), timeout=60).read().decode("utf-8", "replace")
    form = get(SEARCH)
    done = failures = 0
    for r in todo:
        pin = r["PAMS_PIN"]
        if out.get(pin, {}).get("status") in ("found", "not-found"):
            continue
        parts = pin.split("_")
        district, block, lot, qual = str(int(parts[0][2:])), parts[1], parts[2], parts[3] if len(parts) > 3 else ""
        try:
            hidden = {k: html.unescape(v) for k, v in re.findall(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', form)}
            body = {**hidden, "ctl00$MainContent$cmbDistrict": district, "ctl00$MainContent$txtBlock": block, "ctl00$MainContent$txtLot": lot,
                    "ctl00$MainContent$txtQual": qual, "ctl00$MainContent$txtOwner": "", "ctl00$MainContent$txtStreet": "",
                    "ctl00$MainContent$cmbPropClass": " ", "ctl00$MainContent$btnSearch": "Search"}
            result = get(SEARCH, urllib.parse.urlencode(body).encode())
            form = result if "__VIEWSTATE" in result else form
            link = find_detail_link(result, block, lot, qual)
            time.sleep(args.delay)
            if not link:
                out[pin] = {"status": "not-found", "searched": {"district": district, "block": block, "lot": lot, "qualifier": qual}}
            else:
                facts = parse_detail(get(BASE + link))
                out[pin] = {"status": "found" if facts else "not-found", "facts": facts, "url": BASE + link,
                            "source": "Ocean County Board of Taxation tax list search", "retrievedAt": time.strftime("%Y-%m-%d")}
                time.sleep(args.delay)
            failures = 0
        except Exception as exc:  # network trouble: record it and stop after a few in a row
            failures += 1
            out[pin] = {"status": "error", "message": str(exc)[:120]}
            if failures > 5:
                print("Stopping after repeated errors; rerun to resume.")
                break
            time.sleep(args.delay * 3)
        done += 1
        if done % 10 == 0:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps(out, indent=1))
        if args.limit and done >= args.limit:
            break
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=1))
    print(f"{len(todo)} Ocean County parcels; found {sum(1 for v in out.values() if v['status'] == 'found')}, not found {sum(1 for v in out.values() if v['status'] == 'not-found')}, errors {sum(1 for v in out.values() if v['status'] == 'error')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
