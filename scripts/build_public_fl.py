#!/usr/bin/env python3
"""Build PUBLIC, county-wide FL industrial assessment datasets from official NAL-joined cadastral GIS.
Never reads a company data file, CSV shortlist, internal package, or contacts workbook.
No individuals, mailing addresses, sale prices, comps, or financial fields are exported.
"""
import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data"
SOURCE = ("https://services9.arcgis.com/Gh9awoU677aKree0/ArcGIS/rest/services/"
          "Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0")
SHAPES = ("https://services9.arcgis.com/Gh9awoU677aKree0/ArcGIS/rest/services/"
          "Florida_Statewide_Cadastral/FeatureServer/0")
COUNTIES = {"palm-beach": (50, "Palm Beach"), "martin": (43, "Martin"),
            "st-lucie": (56, "St. Lucie")}
INDUSTRIAL_CODES = [f"00{i}" for i in range(40, 50)]
SQL_USE = "(" + " OR ".join(
    ["DOR_UC IN (" + ",".join("'" + code + "'" for code in INDUSTRIAL_CODES) + ")",
     "DOR_UC LIKE '4%'"]) + ")"
FIELDS = "OBJECTID,PARCEL_ID,CO_NO,DOR_UC,OWN_NAME,PHY_ADDR1,PHY_CITY,LND_SQFOOT,ASMNT_YR"
ENTITY_RE = re.compile(
    r"(?<![A-Z0-9])(?:L\.?L\.?C\.?|INC(?:ORPORATED)?\.?|CORP(?:ORATION)?\.?|"
    r"LTD\.?|L\.?L\.?P\.?|L\.?P\.?|LIMITED\s+PARTNERSHIP)(?![A-Z0-9])", re.I)
BAD_RE = re.compile(r"(?i)\b(?:INDIVIDUAL|PERSONAL|PRIVATE\s+PERSON|CONFIDENTIAL|REDACTED)\b")


def clean_entity(name):
    """Fail closed: ambiguous owners (people, family trusts, government, truncated suffixes) are null."""
    name = " ".join(str(name or "").strip().split())[:100]
    if not name or BAD_RE.search(name) or not ENTITY_RE.search(name):
        return None
    return name


def class_code(raw):
    s = str(raw or "").strip()
    if not s.isdigit():
        return None
    if len(s) == 4 and s.startswith("00"):
        k = int(s[2:])
    else:
        k = int(s[:2]) if len(s) >= 2 else int(s)
    return k if 40 <= k <= 49 else None


def record_from_feature(feature, county_number):
    a, g = feature.get("attributes") or {}, feature.get("geometry") or {}
    if int(a.get("CO_NO", -1)) != county_number or class_code(a.get("DOR_UC")) is None:
        return None
    try:
        lon, lat = float(g["x"]), float(g["y"])
    except (KeyError, ValueError, TypeError):
        return None
    if not (-88.0 <= lon <= -79.0 and 24.0 <= lat <= 32.0 and math.isfinite(lon) and math.isfinite(lat)):
        return None
    key = str(a.get("PARCEL_ID") or "").strip()
    if not key:
        return None
    try:
        area = float(a.get("LND_SQFOOT") or 0)
        acres = round(area / 43560.0, 3) if math.isfinite(area) and area > 0 else None
    except (TypeError, ValueError):
        acres = None
    year = a.get("ASMNT_YR")
    year = int(year) if isinstance(year, (int, float)) and 2020 <= year <= 2035 else None
    # Deliberate allowlist. No OWN_ADDR*, FIDU*, sale*, valuation, transfers or financial attributes.
    return {"id": key[:48], "xy": [round(lon, 6), round(lat, 6)],
            "ac": acres, "use": str(a.get("DOR_UC") or "").strip()[:5],
            "owner_entity": clean_entity(a.get("OWN_NAME")),
            "site_address": str(a.get("PHY_ADDR1") or "").strip()[:75],
            "city": str(a.get("PHY_CITY") or "").strip()[:48], "year": year}


def query(params, *, retries=4):
    body = urllib.parse.urlencode(dict(params, f="json")).encode("ascii")
    request = urllib.request.Request(SOURCE + "/query", data=body,
             headers={"User-Agent": "CapitalRadarPublicParcelExport/1.0",
                      "Content-Type": "application/x-www-form-urlencoded"})
    for i in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=65) as response:
                data = json.loads(response.read().decode("utf-8"))
            if "error" in data:
                raise RuntimeError("ArcGIS error: " + str(data["error"])[:350])
            return data
        except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as exc:
            if i == retries-1:
                raise RuntimeError(f"Official public ArcGIS request failed after {retries} attempts: {exc}") from exc
            time.sleep(2**i)


def build_one(slug, code, label, fetched_at):
    where = f"CO_NO = {code} AND {SQL_USE}"
    qcount = query({"where": where, "returnCountOnly": "true", "returnGeometry": "false"})
    qids = query({"where": where, "returnIdsOnly": "true", "returnGeometry": "false"})
    expected = int(qcount.get("count", -1))
    ids = sorted(set(qids.get("objectIds") or []))
    if expected < 0 or len(ids) != expected:
        raise RuntimeError(f"{slug}: returned {len(ids)} IDs but source count is {expected}; refusing incomplete export")
    if not ids:
        raise RuntimeError(f"{slug}: official source returned zero records, cannot publish a suspiciously empty dataset")
    found, selected, invalid, duplicate, redacted = set(), [], 0, 0, 0
    for start in range(0, len(ids), 180):
        part = ids[start:start+180]
        response = query({"objectIds": ",".join(map(str, part)), "outFields": FIELDS,
                          "returnGeometry": "true", "outSR": "4326", "geometryPrecision": "6"})
        features = response.get("features")
        if not isinstance(features, list) or response.get("exceededTransferLimit") or len(features) != len(part):
            raise RuntimeError(f"{slug}: source batch at {start} was incomplete")
        for feat in features:
            oid = (feat.get("attributes") or {}).get("OBJECTID")
            if oid in found:
                duplicate += 1
                continue
            found.add(oid)
            rec = record_from_feature(feat, code)
            if rec is None:
                invalid += 1
                continue
            if rec["owner_entity"] is None:
                redacted += 1
            selected.append(rec)
        if (start // 180) % 10 == 0:
            print(f"{slug}: {min(start+180,len(ids))}/{len(ids)} source objects",flush=True)
        time.sleep(0.15)
    if found != set(ids) or duplicate:
        raise RuntimeError(f"{slug}: missing or duplicate OBJECTIDs; refusing publication")
    if not selected:
        raise RuntimeError(f"{slug}: no valid geocoded records after normalization")
    selected.sort(key=lambda x: x["id"])
    # An ArcGIS polygon layer from the same 2026 NAL-joined data is used on-demand by the app.
    # Never package the unsanitized source or the full upstream ArcGIS response.
    obj = {"schema":"fl-public-industrial-v1", "county":label,"county_number":code,
           "assessment_year":2026,"retrieved_utc":fetched_at,
           "source_url":SOURCE, "parcel_polygon_source_url":SHAPES,
           "record_count":len(selected), "source_count":expected,
           "skipped_incomplete_records":invalid, "masked_owners":redacted, "records":selected}
    destination = OUTPUT / f"fl-{slug}.json"
    temp = destination.with_suffix(".json.tmp")
    temp.write_text(json.dumps(obj, separators=(",",":"), ensure_ascii=False), encoding="utf-8")
    if temp.stat().st_size > 80_000_000:
        temp.unlink()
        raise RuntimeError(f"{slug}: exceeds 80MB published file cap")
    temp.replace(destination)
    print(f"Completed {slug}: {len(selected)} records, {redacted} masked owners, {invalid} incomplete",flush=True)
    return {"county":label, "county_number":code, "path":"data/"+destination.name,
            "records":len(selected),"source_count":expected, "masked_owners":redacted,
            "source_url":SOURCE,"geometry_source_url":SHAPES,
            "retrieved_utc":fetched_at, "bytes":destination.stat().st_size}


def self_test():
    assert clean_entity("JANE DOE") is None
    assert clean_entity("JANE DOE TRUST") is None
    assert clean_entity("JOHN SMITH FAMILY") is None
    assert clean_entity("CONFIDENTIAL LLC") is None
    assert clean_entity("ATLANTIC LOGISTICS LLC") == "ATLANTIC LOGISTICS LLC"
    assert clean_entity("ACME PROPERTY INC.") == "ACME PROPERTY INC."
    assert class_code("0048") == 48 and class_code("4805") == 48
    assert class_code("0001") is None and class_code("4001") == 40
    assert record_from_feature({"attributes":{"CO_NO":50,"DOR_UC":"0048","PARCEL_ID":"00123",
        "OWN_NAME":"JANE DOE","LND_SQFOOT":43560,"PHY_ADDR1":"1 SAMPLE STREET",
        "OWN_ADDR1":"SENSITIVE MAILING","SALE_PRC1":1000000},
        "geometry":{"x":-80.13,"y":26.7}},50) == {
        "id":"00123","xy":[-80.13,26.7],"ac":1.0,"use":"0048","owner_entity":None,
        "site_address":"1 SAMPLE STREET","city":"","year":None}
    print("Public-only sanitization tests PASS",flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--self-test",action="store_true")
    parser.add_argument("--counties",nargs="*",choices=tuple(COUNTIES),default=list(COUNTIES))
    args=parser.parse_args()
    self_test()
    if args.self_test:
        return 0
    OUTPUT.mkdir(exist_ok=True)
    now=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    manifest=[]
    for slug in args.counties:
        code,label=COUNTIES[slug]
        manifest.append(build_one(slug,code,label,now))
    if len(args.counties) == len(COUNTIES):
        (OUTPUT/"manifest.json").write_text(json.dumps({
            "schema":"capital-radar-public-fl-counties-v1","retrieved_utc":now,
            "data_policy":"Entity-owner names only; individual names and all mailing addresses omitted",
            "source_method":"2026 NAL-joined statewide official centroid and polygon layers",
            "counties":manifest
        },separators=(",",":"),indent=2)+"\n",encoding="utf-8")
    return 0


if __name__=="__main__":
    sys.exit(main())
