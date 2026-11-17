#!/usr/bin/env python3
"""Assemble the private contact file that scripts/encrypt-executive-vault.mjs encrypts.

Inputs are private working files (none is committed):
  --base      existing decrypted vault JSON (optional); its records are kept as they are
  --contacts  role-labelled research contacts keyed by PAMS_PIN (optional)
  --matches   carrier-matches.json from nj_carrier_rematch.py
  --owners    county-owners.json from nj_county_owner_lookup.py (optional)
  --published assets/data directory, to keep only parcels still in the published inventory and to skip
              carrier contacts the public card already shows

Every record states an evidence role. None of them is a deed owner.
"""
from __future__ import annotations

import argparse
import glob
import json
from pathlib import Path

ROLE_ON_SITE = "Registered USDOT carrier at this address (occupant, not owner)"
ROLE_MAILING = "USDOT carrier registered at the tax-bill mailing address (lead, not owner)"
ROLE_OWNER = "County tax-list assessment owner (not a deed search)"


def carrier_record(c: dict, role: str) -> dict:
    fields = {v: c["sourceUrl"] for v in (c.get("phone"), c.get("email")) if v}
    return {"company": c.get("carrier") or "", "usdot": c.get("usdot") or "", "officers": c.get("officers") or [],
            "phones": [c["phone"]] if c.get("phone") else [], "emails": [c["email"]] if c.get("email") else [],
            "sourceUrls": [c["sourceUrl"]], "fieldSources": fields, "evidenceRole": role,
            "evidenceBasis": "Active federal carrier filing" + (f", last filed {c['filingDate']}" if c.get("filingDate") else "")}


def build(base: dict, contacts: dict, matches: list[dict], owners: dict, published: dict[str, dict]) -> dict:
    records = dict(base)
    for pin, c in contacts.items():
        if pin in records:
            records[pin] = {**records[pin], "evidenceRole": records[pin].get("evidenceRole") or c.get("evidenceRole"),
                            "evidenceBasis": records[pin].get("evidenceBasis") or c.get("evidenceBasis")}
            continue
        phones = [p.strip() for p in str(c.get("phones") or "").split("/") if any(ch.isdigit() for ch in p)]
        emails = [e.strip() for e in str(c.get("emails") or "").replace(";", ",").split(",") if "@" in e]
        source = (c.get("sourceUrls") or [None])[0]
        records[pin] = {"address": c.get("address"), "company": c.get("company"), "officers": [c["people"]] if c.get("people") else [],
                        "phones": phones, "emails": emails, "sourceUrls": c.get("sourceUrls") or [],
                        "fieldSources": {v: source for v in phones + emails} if source and c.get("evidenceRole") == "Registered USDOT Carrier Officer" else {},
                        "evidenceRole": c.get("evidenceRole"), "evidenceBasis": c.get("evidenceBasis")}
    for m in matches:
        pin = m["pin"]
        if pin not in published:
            continue
        shown = str((published[pin].get("usdotContext") or {}).get("dotNumber") or "")
        on_site = [c for c in m["onSite"] if str(c.get("usdot")) != shown]
        hq = [] if m.get("mailingHqSharedAddress") else m["mailingHq"]
        pick = (on_site[0], ROLE_ON_SITE) if on_site else ((hq[0], ROLE_MAILING) if hq else None)
        owner = owners.get(pin, {}) if owners.get(pin, {}).get("owner") else None
        if pin in records:
            if owner:
                records[pin]["assessmentOwner"] = {"name": owner["owner"], "dataAsOf": owner.get("dataAsOf"), "url": owner.get("url")}
            continue
        if not pick and not owner:
            continue
        record = carrier_record(*pick) if pick else {"company": "", "officers": [], "phones": [], "emails": [], "sourceUrls": [], "fieldSources": {}, "evidenceRole": ROLE_OWNER}
        if owner:
            record["assessmentOwner"] = {"name": owner["owner"], "dataAsOf": owner.get("dataAsOf"), "url": owner.get("url")}
            record["sourceUrls"] = record["sourceUrls"] + [owner["url"]]
        facts = published[pin]["facts"]
        record["address"] = ", ".join(filter(None, [facts.get("PROP_LOC"), facts.get("MUN_NAME"), "NJ"]))
        records[pin] = record
    return records


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--base")
    ap.add_argument("--contacts")
    ap.add_argument("--matches", required=True)
    ap.add_argument("--owners")
    ap.add_argument("--published", default=str(Path(__file__).resolve().parents[1] / "assets/data"))
    ap.add_argument("--out", default="private_build/master_contacts.json")
    args = ap.parse_args(argv)
    load = lambda p, d: json.loads(Path(p).read_text()) if p else d
    base = load(args.base, {})
    published = {r["parcelId"]: r for f in glob.glob(str(Path(args.published) / "nj-research/*.json")) for r in json.loads(Path(f).read_text())["records"]}
    records = build(base.get("recordsByPin", base), load(args.contacts, {}).get("recordsByPin", {}), load(args.matches, []), load(args.owners, {}), published)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"schemaVersion": 2, "notice": "Evidence roles state where each name came from. None is a verified deed owner.", "recordsByPin": records}, indent=1))
    print(f"{len(records)} vault records -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
