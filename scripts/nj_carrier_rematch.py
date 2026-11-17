#!/usr/bin/env python3
"""Match NJ inventory parcels to federal carrier filings two ways, and rank tax-bill mailing clusters.

Evidence roles are kept apart and none of them is ownership:
  on-site     carrier's PHYSICAL address equals the parcel's street address in the same municipality
  mailing-hq  carrier's physical or mailing address equals the parcel's TAX-BILL MAILING address (street + ZIP5)

Inputs are plain JSON lists so the script runs offline and in tests:
  --parcels   rows from the NJ parcel service (PAMS_PIN, PROP_LOC, MUN_NAME, COUNTY, PROP_CLASS, CALC_ACRE,
              ST_ADDRESS, CITY_STATE, ZIP_CODE, PCL_MUN, PCLBLOCK, PCLLOT, PCLQCODE, LAND_VAL, IMPRVT_VAL)
  --carriers  rows from data.transportation.gov resource az4n-8mr2
"""
from __future__ import annotations

import argparse
import collections
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from usdot_site_context import carrier_same_address  # house-number ranges, care-of prefixes, 30-character cut-offs

TYPE = re.compile(r"\s+(BOROUGH|BORO|TOWNSHIP|TWP|CITY|TOWN|VILLAGE)\.?$")
ALIAS = {"PARSIPPANY TR HLS": ["PARSIPPANY"], "PARSIPPANY-TROY HILLS": ["PARSIPPANY"]}
# Base names used by more than one NJ municipality: a street match alone cannot tell them apart.
SHARED = {"WASHINGTON", "FRANKLIN", "HAMILTON", "UNION", "MONROE", "GREENWICH", "SPRINGFIELD", "OCEAN", "LAWRENCE",
          "MANSFIELD", "GLOUCESTER", "EGG HARBOR", "FAIRFIELD", "HOPEWELL", "BURLINGTON", "PEMBERTON", "CHESTER",
          "MENDHAM", "BOONTON", "ROCKAWAY", "FREEHOLD", "LEBANON", "CLINTON", "BERLIN", "MILLSTONE"}
WORDS = {"STREET": "ST", "AVENUE": "AVE", "AV": "AVE", "ROAD": "RD", "BOULEVARD": "BLVD", "DRIVE": "DR", "LANE": "LN",
         "COURT": "CT", "PLACE": "PL", "HIGHWAY": "HWY", "ROUTE": "RT", "RTE": "RT", "PARKWAY": "PKWY",
         "TURNPIKE": "TPKE", "TERRACE": "TER", "CIRCLE": "CIR", "PLAZA": "PLZ", "SQUARE": "SQ", "TRAIL": "TRL",
         "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W", "FIRST": "1ST", "SECOND": "2ND", "THIRD": "3RD",
         "FOURTH": "4TH", "FIFTH": "5TH", "SIXTH": "6TH", "SEVENTH": "7TH", "EIGHTH": "8TH", "NINTH": "9TH",
         "TENTH": "10TH", "POST": "PO"}


def upper(value) -> str:
    return re.sub(r"\s+", " ", str(value or "").upper()).strip()


def town(value) -> str:
    return TYPE.sub("", upper(value)).strip()


def towns(value) -> list[str]:
    """Every city spelling a carrier filing may use for this municipality (same rules as radar-contact-verifier.js)."""
    raw, base = upper(value), town(value)
    out = [base] if base else []
    if re.search(r"\sCITY$", raw):
        out.append(raw)
    if re.search(r"\sCITY\s+(TWP|TOWNSHIP)\.?$", raw):
        out.append(re.sub(r"\s+CITY$", "", base))
    out += ALIAS.get(base, []) + ALIAS.get(raw, [])
    return list(dict.fromkeys(x for x in out if x))


def same_town(a, b) -> bool:
    x, y = upper(a), upper(b)
    if not x or not y:
        return False
    return y in towns(x) or x in towns(y) or (town(x) == town(y) and not x.endswith(" CITY") and not y.endswith(" CITY"))


def shared_town(value) -> bool:
    return town(value) in SHARED


def street(value) -> str:
    """'60 Grant Avenue, Suite 2' -> '60 GRANT AVE'. Units are dropped; PO boxes keep their number."""
    text = upper(str(value or "").split(",")[0]).replace(".", "").replace("#", " ")
    text = re.sub(r"\bP\s*O\s*BOX\b|\bPOST OFFICE BOX\b", "PO BOX", text)
    text = re.sub(r"\b(UNIT|SUITE|STE|APT|FLOOR|FL|BLDG|BUILDING|RM|ROOM)\b.*$", "", text)
    return " ".join(WORDS.get(word, word) for word in text.split()).strip()


def zip5(value) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[:5] if len(digits) >= 5 else ""


def numbered(key: str) -> bool:
    return bool(re.match(r"^(\d|PO BOX \d)", key))


def contact(row: dict) -> dict:
    return {"usdot": row.get("dot_number"), "carrier": row.get("legal_name") or row.get("dba_name"),
            "dba": row.get("dba_name") or "", "officers": [o for o in (row.get("company_officer_1"), row.get("company_officer_2")) if o],
            "phone": row.get("phone") or "", "email": (row.get("email_address") or "").lower(),
            "filingDate": row.get("mcs150_date") or "", "physical": ", ".join(filter(None, [row.get("phy_street"), row.get("phy_city"), row.get("phy_state"), row.get("phy_zip")])),
            "sourceUrl": "https://data.transportation.gov/resource/az4n-8mr2.json?$where=dot_number=" + str(row.get("dot_number"))}


def index_carriers(carriers: list[dict]):
    by_town, by_address = collections.defaultdict(list), collections.defaultdict(list)
    for row in carriers:
        if row.get("status_code") != "A":  # inactive filings are stale businesses, not contacts
            continue
        phy = street(row.get("phy_street"))
        if row.get("phy_state") == "NJ" and row.get("phy_street"):
            by_town[upper(row.get("phy_city"))].append(row)
        if numbered(phy) and zip5(row.get("phy_zip")):
            by_address[(phy, zip5(row.get("phy_zip")))].append(("physical", row))
        mail = street(row.get("carrier_mailing_street"))
        if numbered(mail) and zip5(row.get("carrier_mailing_zip")) and (mail, zip5(row.get("carrier_mailing_zip"))) != (phy, zip5(row.get("phy_zip"))):
            by_address[(mail, zip5(row.get("carrier_mailing_zip")))].append(("mailing", row))
    return by_town, by_address


def match(parcels: list[dict], carriers: list[dict], shared_limit: int = 5) -> list[dict]:
    by_town, by_address = index_carriers(carriers)
    out = []
    for p in parcels:
        site, mail, z = street(p.get("PROP_LOC")), street(p.get("ST_ADDRESS")), zip5(p.get("ZIP_CODE"))
        on_site = []
        if re.match(r"^\d", site):
            for name in towns(p.get("MUN_NAME")):
                for r in by_town.get(name, []):
                    if street(r.get("phy_street")) == site or carrier_same_address(r.get("phy_street"), p.get("PROP_LOC")):
                        on_site.append(r)
        on_site = list({r["dot_number"]: r for r in on_site}.values())
        on_site.sort(key=lambda r: str(r.get("mcs150_date") or ""), reverse=True)
        hq = by_address.get((mail, z), []) if numbered(mail) and z else []
        site_ids = {r["dot_number"] for r in on_site}
        hq = [(kind, r) for kind, r in hq if r["dot_number"] not in site_ids]
        out.append({"pin": p["PAMS_PIN"], "onSite": [contact(r) for r in on_site], "onSiteSharedTownName": bool(on_site) and shared_town(p.get("MUN_NAME")),
                    "mailingHq": [dict(contact(r), matchedCarrierAddress=kind) for kind, r in hq[:shared_limit]],
                    "mailingHqCount": len(hq), "mailingHqSharedAddress": len(hq) > shared_limit,
                    "mailingSameAsSite": bool(mail) and mail == site})
    return out


def mapped_acres(p: dict) -> float:
    """Area measured from the parcel polygon when supplied (GEOM_ACRES). The service's CALC_ACRE field holds
    square feet or other units for some municipalities, so it is only a fallback."""
    value = p.get("GEOM_ACRES")
    return float(value) if value not in (None, "") else float(p.get("CALC_ACRE") or 0)


def acreage_suspect(p: dict) -> bool:
    geom, published = p.get("GEOM_ACRES"), float(p.get("CALC_ACRE") or 0)
    if geom in (None, "") or float(geom) <= 0:
        return published > 1000
    ratio = published / float(geom)
    return ratio > 3 or ratio < 1 / 3


COUNTY_CODE = {"ATLANTIC": "01", "BERGEN": "02", "BURLINGTON": "03", "CAMDEN": "04", "CAPE MAY": "05", "CUMBERLAND": "06",
               "ESSEX": "07", "GLOUCESTER": "08", "HUDSON": "09", "HUNTERDON": "10", "MERCER": "11", "MIDDLESEX": "12",
               "MONMOUTH": "13", "MORRIS": "14", "OCEAN": "15", "PASSAIC": "16", "SALEM": "17", "SOMERSET": "18",
               "SUSSEX": "19", "UNION": "20", "WARREN": "21"}
# Counties whose own Board of Taxation page links to this public records search (checked 2026-11-17).
# The link is a plain GET that lists block, lot, class, location and the assessment owner name.
COUNTY_SEARCH_PUBLISHED = {"02", "03", "06", "08", "09", "17", "20"}
COUNTY_BOARD_PAGE = {"12": "https://www.middlesexcountynj.gov/government/departments/department-of-finance/board-of-taxation",
                     "13": "https://oprs.co.monmouth.nj.us/oprs/External.aspx?iId=12",
                     "14": "https://www.morriscountynj.gov/Departments/Board-of-Taxation",
                     "19": "https://www.sussex.nj.us/cn/webpage.cfm?tpid=862",
                     "21": "https://www.warrencountynj.gov/government/tax-board"}


def county_record_link(p: dict) -> dict:
    """Pre-filled county tax-list link where the county publishes one; otherwise the board page plus block/lot."""
    code = COUNTY_CODE.get(upper(p.get("COUNTY")), "")
    district, block, lot, qual = str(p.get("PCL_MUN") or "").strip(), str(p.get("PCLBLOCK") or "").strip(), str(p.get("PCLLOT") or "").strip(), str(p.get("PCLQCODE") or "").strip()
    if code in COUNTY_SEARCH_PUBLISHED and re.fullmatch(r"\d{4}", district) and district.startswith(code) and block and lot:
        from urllib.parse import urlencode
        query = urlencode({"ms_user": "ctb" + code, "passwd": "", "srch_type": "1", "select_cc": code + "01", "district": district,
                           "adv": "1", "out_type": "1", "ms_ln": "50", "p_loc": "", "owner": "", "block": block, "lot": lot, "qual": qual})
        return {"kind": "prefilled", "url": "https://taxrecords-nj.com/pub/cgi/inf.cgi?" + query}
    return {"kind": "manual", "url": COUNTY_BOARD_PAGE.get(code, "https://www.nj.gov/treasury/taxation/lpt/cboards.shtml"),
            "enter": f"district {district}, block {block}, lot {lot}" + (f", qualifier {qual}" if qual else "")}


def clusters(parcels: list[dict], classes=("4B", "1"), top: int = 100) -> list[dict]:
    """Group by tax-bill mailing address + ZIP5: one taxpayer usually pays for several lots. Ranked by mapped acres."""
    groups = collections.defaultdict(list)
    for p in parcels:
        if p.get("PROP_CLASS") in classes and street(p.get("ST_ADDRESS")) and zip5(p.get("ZIP_CODE")):
            groups[(street(p["ST_ADDRESS"]), zip5(p["ZIP_CODE"]))].append(p)
    rows = []
    for (addr, z), items in groups.items():
        items.sort(key=lambda p: -mapped_acres(p))
        acres = [mapped_acres(p) for p in items]
        rows.append({"mailingAddress": addr, "zip": z, "cityState": upper(items[0].get("CITY_STATE")), "parcels": len(items),
                     "totalAcres": round(sum(acres), 2), "largestAcres": round(max(acres), 2),
                     "acreageNeedsCheck": any(acreage_suspect(p) for p in items),
                     "landValue": sum(int(p.get("LAND_VAL") or 0) for p in items), "improvementValue": sum(int(p.get("IMPRVT_VAL") or 0) for p in items),
                     "municipalities": sorted({upper(p.get("MUN_NAME")) for p in items}), "counties": sorted({upper(p.get("COUNTY")) for p in items}),
                     "tracts": sorted({t for p in items for t in p.get("tracts", [])}), "pins": [p["PAMS_PIN"] for p in items]})
    rows.sort(key=lambda r: (-r["totalAcres"], r["mailingAddress"]))
    return rows[:top]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--parcels", required=True)
    ap.add_argument("--carriers", required=True)
    ap.add_argument("--out", required=True, help="output directory")
    args = ap.parse_args(argv)
    parcels = [p for p in json.loads(Path(args.parcels).read_text()) if not p.get("missing")]
    carriers = json.loads(Path(args.carriers).read_text())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    matches = match(parcels, carriers)
    (out / "carrier-matches.json").write_text(json.dumps(matches, indent=1))
    (out / "mailing-clusters.json").write_text(json.dumps(clusters(parcels), indent=1))
    with (out / "carrier-matches-summary.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["PAMS_PIN", "ON_SITE_CARRIERS", "MAILING_HQ_CARRIERS", "MAILING_HQ_SHARED_ADDRESS"])
        for m in matches:
            w.writerow([m["pin"], len(m["onSite"]), m["mailingHqCount"], m["mailingHqSharedAddress"]])
    print(f"{len(parcels)} parcels; on-site carrier: {sum(1 for m in matches if m['onSite'])}; mailing-HQ carrier: {sum(1 for m in matches if m['mailingHq'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
