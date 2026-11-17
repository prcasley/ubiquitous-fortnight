#!/usr/bin/env python3
"""Download the inputs for nj_carrier_rematch.py into a private folder (default .radar/rematch, gitignored).

  parcels.json   current facts, tax-bill mailing address and MAPPED acreage for every published inventory parcel
  carriers.json  federal carrier filings for New Jersey plus the out-of-state mailing ZIP codes found on the parcels

Usage: python3 scripts/nj_pull_rematch_inputs.py && \\
       python3 scripts/nj_carrier_rematch.py --parcels .radar/rematch/parcels.json --carriers .radar/rematch/carriers.json --out .radar/rematch/out
"""
from __future__ import annotations

import argparse
import collections
import glob
import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARCELS = "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query"
CARRIERS = "https://data.transportation.gov/resource/az4n-8mr2.json?"
FIELDS = ("PAMS_PIN,PROP_LOC,MUN_NAME,COUNTY,PROP_CLASS,CALC_ACRE,ST_ADDRESS,CITY_STATE,ZIP_CODE,PCL_MUN,PCLBLOCK,PCLLOT,PCLQCODE,"
          "LAND_VAL,IMPRVT_VAL,NET_VALUE,BLDG_DESC,YR_CONSTR,DEED_DATE,SALE_PRICE")
SELECT = ("dot_number,legal_name,dba_name,status_code,phy_street,phy_city,phy_state,phy_zip,carrier_mailing_street,carrier_mailing_city,"
          "carrier_mailing_state,carrier_mailing_zip,phone,cell_phone,email_address,mcs150_date,company_officer_1,company_officer_2,power_units")


def fetch(url: str, data: bytes | None = None, attempts: int = 4):
    error = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=120) as response:
                body = json.loads(response.read())
            if isinstance(body, dict) and body.get("error"):
                raise RuntimeError(str(body["error"])[:200])
            return body
        except Exception as exc:  # bounded retry; the caller sees the last error
            error = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Source unavailable: {error}")


def ring_acres(rings) -> float:
    """Polygon area in acres from longitude/latitude rings (local equirectangular projection)."""
    total = 0.0
    for ring in rings:
        lat = math.radians(sum(p[1] for p in ring) / len(ring))
        kx, ky = 111320 * math.cos(lat), 110574
        total += sum((x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky) for (x1, y1), (x2, y2) in zip(ring, ring[1:])) / 2
    return abs(total) / 4046.8564


def published_pins() -> dict[str, list[str]]:
    tracts = {}
    for name in glob.glob(str(ROOT / "assets/data/nj-research/*.json")):
        for record in json.loads(Path(name).read_text())["records"]:
            tracts[record["parcelId"]] = record.get("tractReferences") or []
    return tracts


def pull_parcels(tracts: dict[str, list[str]]) -> list[dict]:
    pins, facts, area = sorted(tracts), {}, collections.Counter()
    for start in range(0, len(pins), 40):
        where = "PAMS_PIN IN (%s)" % ",".join("'" + p.replace("'", "''") + "'" for p in pins[start:start + 40])
        body = urllib.parse.urlencode({"f": "json", "where": where, "outFields": FIELDS, "returnGeometry": "true", "outSR": "4326", "geometryPrecision": "7"}).encode()
        for feature in fetch(PARCELS, body).get("features", []):
            pin = feature["attributes"]["PAMS_PIN"]
            facts.setdefault(pin, feature["attributes"])
            area[pin] += ring_acres([[tuple(pt[:2]) for pt in ring] for ring in feature.get("geometry", {}).get("rings", [])])
        time.sleep(0.15)
    return [dict(facts[p], tracts=tracts[p], GEOM_ACRES=round(area[p], 3)) if p in facts else {"PAMS_PIN": p, "missing": True, "tracts": tracts[p]} for p in pins]


def pull_carriers(parcels: list[dict]) -> list[dict]:
    def pages(where):
        offset = 0
        while True:
            batch = fetch(CARRIERS + urllib.parse.urlencode({"$select": SELECT, "$where": where, "$order": "dot_number", "$limit": 50000, "$offset": offset}))
            yield from batch
            if len(batch) < 50000:
                return
            offset += 50000
    rows = {r["dot_number"]: r for r in pages("phy_state='NJ' OR carrier_mailing_state='NJ'")}
    zips = sorted({str(p.get("ZIP_CODE") or "")[:5] for p in parcels if not p.get("missing") and not str(p.get("CITY_STATE") or "").upper().rstrip().endswith("NJ")})
    zips = [z for z in zips if len(z) == 5 and z.isdigit()]
    for start in range(0, len(zips), 40):
        where = " OR ".join(f"phy_zip like '{z}%' OR carrier_mailing_zip like '{z}%'" for z in zips[start:start + 40])
        for r in pages(where):
            rows.setdefault(r["dot_number"], r)
    return list(rows.values())


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=str(ROOT / ".radar/rematch"))
    args = ap.parse_args(argv)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    parcels = pull_parcels(published_pins())
    (out / "parcels.json").write_text(json.dumps(parcels))
    print(f"{sum(1 for p in parcels if not p.get('missing'))} of {len(parcels)} parcels returned")
    carriers = pull_carriers(parcels)
    (out / "carriers.json").write_text(json.dumps(carriers))
    print(f"{len(carriers)} carrier filings ({sum(1 for c in carriers if c.get('status_code') == 'A')} active)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
