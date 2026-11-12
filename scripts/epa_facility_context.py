#!/usr/bin/env python3
"""Attach EPA ECHO/FRS facilities (on-site operators) to NJ research parcels.

For each county in the research file, every EPA-regulated facility is pulled from ECHO
(name, street, city, registry ID, coordinates, industry). A facility is attached to a parcel when
  * its EPA map point falls inside the parcel boundary ("location"), or
  * its house number and street name equal the parcel's site address in the same county and it is in the
    same town or within 1.5 km of the parcel ("address").
Facilities are on-site operators/permittees recorded by EPA, not owners. EPA publishes no phone or
contact person in these services, so none is produced. Each facility links to its EPA FRS record.

Usage: python3 scripts/epa_facility_context.py --research-json FULL.json --scan SCAN.json
"""
import argparse, json, re, sys, time, urllib.parse, urllib.request

ECHO = "https://echodata.epa.gov/echo/echo_rest_services."
FRS_DETAIL = "https://frs-public.epa.gov/ords/frs_public2/fii_query_detail.disp_program_facility?p_registry_id="
COLUMNS = "1,2,3,5,6,7,16,17,19,20,90,97"
ABBR = {"STREET": "ST", "AVENUE": "AVE", "ROAD": "RD", "DRIVE": "DR", "BOULEVARD": "BLVD", "HIGHWAY": "HWY",
        "LANE": "LN", "COURT": "CT", "PLACE": "PL", "PARKWAY": "PKWY", "TERRACE": "TER", "NORTH": "N",
        "SOUTH": "S", "EAST": "E", "WEST": "W", "ROUTE": "RT", "RTE": "RT", "AV": "AVE"}


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                return json.load(r)
        except Exception:
            if i + 1 == tries:
                raise
            time.sleep(3 * (i + 1))


def county_facilities(county):
    first = get(ECHO + "get_facilities?" + urllib.parse.urlencode({"output": "JSON", "p_st": "NJ", "p_co": county, "qcolumns": COLUMNS}))
    res = first["Results"]
    qid, rows, out, page = res["QueryID"], int(res["QueryRows"]), [], 1
    while len(out) < rows:
        d = get(ECHO + "get_qid?" + urllib.parse.urlencode({"output": "JSON", "qid": qid, "pageno": page, "responseset": 5000, "qcolumns": COLUMNS}))
        facs = d["Results"].get("Facilities") or []
        if not facs:
            break
        out.extend(facs)
        page += 1
    return out, rows


def norm_address(text):
    m = re.match(r"^\s*(\d+)[A-Z]?(?:\s*-\s*\d+[A-Z]?)?\s+(.+?)\.?\s*$", str(text or "").upper())
    if not m:
        return None
    words = [ABBR.get(w, w) for w in re.sub(r"[^A-Z0-9 ]", " ", m.group(2)).split()]
    return m.group(1) + " " + " ".join(words) if words else None


def inside(lon, lat, geom):
    def ring_has(ring):
        hit, j = False, len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i][0], ring[i][1]
            xj, yj = ring[j][0], ring[j][1]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi:
                hit = not hit
            j = i
        return hit
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"] if geom["type"] == "MultiPolygon" else []
    return any(ring_has(p[0]) and not any(ring_has(h) for h in p[1:]) for p in polys)


def bbox(geom):
    pts = [pt for poly in ([geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]) for ring in poly for pt in ring]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def facility(f, how):
    rid = str(f.get("RegistryID") or "").strip()
    return {"role": "on-site-facility-not-owner", "match": how, "name": (f.get("FacName") or "").strip(),
            "address": ", ".join(x for x in [(f.get("FacStreet") or "").strip(), (f.get("FacCity") or "").strip(), "NJ " + (f.get("FacZip") or "").strip()] if x),
            "registryId": rid or None, "industry": (f.get("FacSICDescs") or "").strip() or None, "naics": (f.get("FacNAICSCodes") or "").strip() or None,
            "active": f.get("FacActiveFlag") == "Y", "sourceURL": FRS_DETAIL + rid if rid else None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--research-json", required=True)
    ap.add_argument("--scan", required=True)
    a = ap.parse_args()
    data = json.load(open(a.research_json))
    geoms = {p["parcelId"]: p.get("geometry") for p in json.load(open(a.scan))["parcels"]}
    by_county = {}
    for r in data["records"]:
        by_county.setdefault(str(r["facts"].get("COUNTY") or "").upper(), []).append(r)
    coverage, checked_at = {}, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    for county, recs in sorted(by_county.items()):
        try:
            facs, rows = county_facilities(county)
            coverage[county] = {"status": "checked" if len(facs) >= rows else "partial", "facilities": len(facs), "expected": rows}
        except Exception as exc:
            coverage[county] = {"status": "unavailable", "message": str(exc)[:200]}
            for r in recs:
                r["epaContext"] = {"status": "unavailable", "checkedAt": checked_at, "facilities": []}
            print("EPA", county, coverage[county], flush=True)
            continue
        by_addr = {}
        for f in facs:
            k = norm_address(f.get("FacStreet"))
            if k:
                by_addr.setdefault(k, []).append(f)
        pts = [(float(f["FacLong"]), float(f["FacLat"]), f) for f in facs if f.get("FacLat") and f.get("FacLong")]
        for r in recs:
            hits, seen = [], set()
            g = geoms.get(r["parcelId"])
            if g and g.get("type") in ("Polygon", "MultiPolygon"):
                x0, y0, x1, y1 = bbox(g)
                for lon, lat, f in pts:
                    if x0 <= lon <= x1 and y0 <= lat <= y1 and inside(lon, lat, g) and f.get("RegistryID") not in seen:
                        seen.add(f.get("RegistryID")); hits.append(facility(f, "location"))
            k = norm_address(r["facts"].get("PROP_LOC"))
            town = re.sub(r"\s+(BORO|BOROUGH|TWP|TOWNSHIP|CITY|TOWN|VILLAGE)$", "", str(r["facts"].get("MUN_NAME") or "").upper().strip())
            for f in by_addr.get(k, []) if k else []:
                if f.get("RegistryID") in seen:
                    continue
                city = str(f.get("FacCity") or "").upper()
                same_town = bool(town) and (town.split()[0] in city or city.split()[0:1] and city.split()[0] in town)
                near = False
                if g and f.get("FacLat") and f.get("FacLong"):
                    x0, y0, x1, y1 = bbox(g)
                    lon, lat = float(f["FacLong"]), float(f["FacLat"])
                    dx = max(x0 - lon, 0, lon - x1) * 85000  # metres per degree longitude near 40°N
                    dy = max(y0 - lat, 0, lat - y1) * 111000
                    near = (dx * dx + dy * dy) ** 0.5 <= 1500
                if same_town or near:
                    seen.add(f.get("RegistryID")); hits.append(facility(f, "address"))
            hits.sort(key=lambda h: (not h["active"], h["match"] != "address", h["name"]))
            r["epaContext"] = {"status": "observed", "checkedAt": checked_at, "facilities": hits[:12],
                               "caveat": "EPA-regulated facilities recorded at this parcel. Operators/permittees, not owners. EPA publishes no phone or contact person here."}
        print("EPA", county, coverage[county], flush=True)
    data["coverage"]["epa"] = {"source": "EPA ECHO facility search + FRS registry links", "checkedAt": checked_at, "counties": coverage}
    json.dump(data, open(a.research_json, "w"))
    print(json.dumps({"records": len(data["records"]), "withEpaFacility": sum(1 for r in data["records"] if r.get("epaContext", {}).get("facilities"))}))


if __name__ == "__main__":
    sys.exit(main())
