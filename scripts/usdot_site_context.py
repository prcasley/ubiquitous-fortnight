#!/usr/bin/env python3
"""Add federal motor-carrier (USDOT / FMCSA Company Census) context to an NJ parcel-lead CSV.

What it does
  * Loads carriers for each municipality in the input CSV from the official Company Census
    dataset (data.transportation.gov resource az4n-8mr2) in one paged query per town.
  * Matches a carrier to a parcel ONLY when the carrier's PHYSICAL street address equals the
    parcel's PROPERTY_ADDRESS (same house number and same standardized street) in the same town.
    The carrier's mailing address is never used for matching: a mailing address is often an
    accountant, agent or head office, not the site.
  * Labels every match ON-SITE CARRIER (USDOT) - NOT THE PROPERTY OWNER. A carrier at an
    address is usually a tenant or operator.

What it does not do
  * It does not change owner fields, infer ownership or authority to sell, or create contacts.
  * The census has no email field; none is produced. The phone is the carrier's business line
    as filed with FMCSA and may be stale (see USDOT_MCS150_DATE).
  * Works on a lead CSV (--csv) or on the published NJ research file (--research-json),
    adding a usdotContext block to each record by PAMS_PIN.

Examples
  python3 scripts/usdot_site_context.py --csv .radar/oz-research/nj-parcel-leads-municipalities.csv
  python3 scripts/usdot_site_context.py --research-json assets/data/nj-parcel-research.json
"""
from __future__ import annotations

import argparse, csv, json, os, re, sys, tempfile, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from nj_parcel_leads import same_address  # noqa: E402  (shared, tested address matcher)

DATASET = "https://data.transportation.gov/resource/az4n-8mr2.json"
SNAPSHOT = "https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string="
FIELDS = ["dot_number", "legal_name", "dba_name", "phy_street", "phy_city", "phy_state", "phy_zip",
          "company_officer_1", "company_officer_2", "phone", "status_code", "power_units", "mcs150_date"]
ROLE = "ON-SITE CARRIER (USDOT) - NOT THE PROPERTY OWNER"
OUT_COLS = ["USDOT_ROLE", "USDOT_MATCH_METHOD", "USDOT_NUMBER", "USDOT_CARRIER_NAME", "USDOT_DBA",
            "USDOT_OFFICER_1", "USDOT_OFFICER_2", "USDOT_BUSINESS_PHONE", "USDOT_STATUS",
            "USDOT_POWER_UNITS", "USDOT_MCS150_DATE", "USDOT_OTHER_CARRIERS_AT_ADDRESS",
            "USDOT_SOURCE_URL", "USDOT_CHECKED_AT"]
PAGE = 5000
MAX_ROWS_PER_TOWN = 50000
TOWN_SUFFIX = re.compile(r"\s+(BORO|BOROUGH|CITY|TOWNSHIP|TWP\.?|TOWN|VILLAGE)$", re.I)


def town_name(municipality: str) -> str:
    """'CARTERET BORO' -> 'CARTERET'; FMCSA stores plain city names."""
    return TOWN_SUFFIX.sub("", str(municipality or "").strip()).upper()


def soql_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def fetch_town(town: str, state: str = "NJ", opener=urllib.request.urlopen, sleep=time.sleep) -> list[dict]:
    rows, offset = [], 0
    where = f"phy_state={soql_quote(state)} AND upper(phy_city)={soql_quote(town)}"
    while True:
        query = urllib.parse.urlencode({"$select": ",".join(FIELDS), "$where": where,
                                        "$order": "dot_number", "$limit": PAGE, "$offset": offset})
        with opener(DATASET + "?" + query, timeout=60) as resp:
            batch = json.loads(resp.read().decode("utf-8"))
        if not isinstance(batch, list):
            raise RuntimeError(f"Unexpected USDOT response for {town}")
        rows.extend(batch)
        if len(batch) < PAGE:
            return rows
        offset += PAGE
        if offset >= MAX_ROWS_PER_TOWN:
            raise RuntimeError(f"More than {MAX_ROWS_PER_TOWN} carriers in {town}; narrow the scan")
        sleep(0.3)


def status_label(code: str) -> str:
    return {"A": "ACTIVE", "I": "INACTIVE", "P": "PENDING"}.get(str(code or "").upper(), str(code or "UNKNOWN"))


def rank(carrier: dict) -> tuple:
    # Prefer active carriers, then the most recently updated filing.
    return (carrier.get("status_code") == "A", str(carrier.get("mcs150_date") or ""))


def match_parcel(parcel_address: str, carriers: list[dict]) -> list[dict]:
    hits = [c for c in carriers if c.get("phy_street") and same_address(c["phy_street"], parcel_address)]
    return sorted(hits, key=rank, reverse=True)


def enrich(rows: list[dict], carriers_by_town: dict[str, list[dict]], checked_at: str) -> list[dict]:
    out = []
    for row in rows:
        new = dict(row)
        for col in OUT_COLS:
            new[col] = ""
        town = town_name(row.get("MUNICIPALITY"))
        carriers = carriers_by_town.get(town)
        if carriers is None:
            new["USDOT_MATCH_METHOD"] = "not checked (town lookup unavailable)"
        else:
            hits = match_parcel(row.get("PROPERTY_ADDRESS") or "", carriers)
            new["USDOT_CHECKED_AT"] = checked_at
            if not hits:
                new["USDOT_MATCH_METHOD"] = "no carrier filed at this street address"
            else:
                best = hits[0]
                dot = str(best.get("dot_number") or "")
                new.update({
                    "USDOT_ROLE": ROLE,
                    "USDOT_MATCH_METHOD": "same town + same physical street address (not mailing address)",
                    "USDOT_NUMBER": dot,
                    "USDOT_CARRIER_NAME": best.get("legal_name") or "",
                    "USDOT_DBA": best.get("dba_name") or "",
                    "USDOT_OFFICER_1": best.get("company_officer_1") or "",
                    "USDOT_OFFICER_2": best.get("company_officer_2") or "",
                    "USDOT_BUSINESS_PHONE": best.get("phone") or "",
                    "USDOT_STATUS": status_label(best.get("status_code")),
                    "USDOT_POWER_UNITS": best.get("power_units") or "",
                    "USDOT_MCS150_DATE": str(best.get("mcs150_date") or "")[:10],
                    "USDOT_OTHER_CARRIERS_AT_ADDRESS": len(hits) - 1,
                    "USDOT_SOURCE_URL": SNAPSHOT + urllib.parse.quote(dot) if dot else DATASET,
                })
        out.append(new)
    return out


def write_csv(path: Path, rows: list[dict], cols: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    cell = lambda v: "'" + v if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r") else v
    with os.fdopen(fd, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: cell(r.get(k, "")) for k in cols})
    os.replace(tmp, path)


def load_towns(towns):
    if len(towns) > 25:
        raise SystemExit("More than 25 towns in one run; split the input")
    carriers_by_town, coverage = {}, {}
    for town in towns:
        try:
            carriers_by_town[town] = fetch_town(town)
            coverage[town] = {"status": "checked", "carriers": len(carriers_by_town[town])}
        except Exception as exc:  # keep going; that town is marked not checked
            coverage[town] = {"status": "unavailable", "message": str(exc)[:200]}
        print(f"USDOT {town}: {coverage[town]}", flush=True)
    return carriers_by_town, coverage


def context_block(row: dict) -> dict:
    """Compact per-record block for the published research JSON."""
    block = {"role": "on-site-carrier-not-owner", "label": ROLE, "matchMethod": row["USDOT_MATCH_METHOD"],
             "checkedAt": row["USDOT_CHECKED_AT"] or None, "source": DATASET}
    if row["USDOT_ROLE"]:
        block.update({"dotNumber": row["USDOT_NUMBER"], "carrierName": row["USDOT_CARRIER_NAME"],
                      "dba": row["USDOT_DBA"] or None,
                      "officers": [o for o in (row["USDOT_OFFICER_1"], row["USDOT_OFFICER_2"]) if o],
                      "businessPhone": row["USDOT_BUSINESS_PHONE"] or None, "status": row["USDOT_STATUS"],
                      "powerUnits": row["USDOT_POWER_UNITS"] or None, "filingDate": row["USDOT_MCS150_DATE"] or None,
                      "otherCarriersAtAddress": row["USDOT_OTHER_CARRIERS_AT_ADDRESS"], "sourceURL": row["USDOT_SOURCE_URL"]})
    return block


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--csv", help="Lead CSV from nj_parcel_leads.py (needs MUNICIPALITY, PROPERTY_ADDRESS)")
    src.add_argument("--research-json", help="RadarNJParcelResearch JSON to update in place (e.g. assets/data/nj-parcel-research.json)")
    ap.add_argument("--out", default=str(ROOT / ".radar/oz-research/nj-parcel-leads-usdot.csv"))
    args = ap.parse_args(argv)
    checked_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    if args.research_json:
        path = Path(args.research_json)
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("format") != "RadarNJParcelResearch":
            raise SystemExit("Not a RadarNJParcelResearch file")
        rows = [{"MUNICIPALITY": (r.get("facts") or {}).get("MUN_NAME"), "PROPERTY_ADDRESS": (r.get("facts") or {}).get("PROP_LOC"),
                 "PAMS_PIN": r.get("parcelId")} for r in data["records"]]
        carriers_by_town, coverage = load_towns(sorted({town_name(r["MUNICIPALITY"]) for r in rows if r["MUNICIPALITY"]}))
        enriched = enrich(rows, carriers_by_town, checked_at)
        for record, row in zip(data["records"], enriched):
            record["usdotContext"] = context_block(row)
        matched = sum(1 for r in enriched if r["USDOT_ROLE"])
        data.setdefault("coverage", {})["usdot"] = {"checkedAt": checked_at, "towns": coverage, "parcelsWithOnSiteCarrier": matched}
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(tmp, path)
        print(json.dumps({"records": len(enriched), "withOnSiteCarrier": matched, "updated": str(path)}))
        return 0

    out_path = Path(args.out)
    with open(args.csv, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        rows, cols = list(reader), list(reader.fieldnames or [])
    if not rows or not {"MUNICIPALITY", "PROPERTY_ADDRESS"} <= set(cols):
        raise SystemExit("Input needs MUNICIPALITY and PROPERTY_ADDRESS columns")
    carriers_by_town, coverage = load_towns(sorted({town_name(r["MUNICIPALITY"]) for r in rows if r.get("MUNICIPALITY")}))
    enriched = enrich(rows, carriers_by_town, checked_at)
    write_csv(out_path, enriched, cols + [c for c in OUT_COLS if c not in cols])
    matched = sum(1 for r in enriched if r["USDOT_ROLE"])
    out_path.with_suffix(".coverage.json").write_text(json.dumps({
        "checkedAt": checked_at, "source": DATASET, "towns": coverage, "parcels": len(enriched),
        "parcelsWithOnSiteCarrier": matched,
        "note": "Carrier = on-site operator or tenant reference, not the property owner. No email field exists in the census.",
    }, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"parcels": len(enriched), "withOnSiteCarrier": matched, "out": str(out_path)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
