#!/usr/bin/env python3
"""
nj_parcel_leads.py - build an NJ industrial call sheet from public state data.

For each parcel it adds:
  * the tax-bill mailing city/state (street line only with --full-mailing),
  * how many other parcels in the sheet share that mailing address (mailing association; not proof of a portfolio),
  * NJDEP regulatory references matched to the parcel (NJEMS sites, layer 143) and their
    program records (table 148): name, program, active flag, start/end dates.

NJ's public parcel layer leaves OWNER_NAME blank, so nothing here is an owner of record.
NJDEP names are regulatory references, not verified current occupants/operators or owners. Every match carries
how it was made and a confidence level so a person can verify before calling.

Input, one of:
  --csv FILE        a CSV with a PAMS_PIN column (other columns are kept)
  --muni CODES      4-digit municipality codes, e.g. 1201,1219 (Carteret, Sayreville)
Options: --classes 4B,4A,1  --min-acres 2  --out leads.csv  --full-mailing
"""
import argparse, csv, datetime as dt, json, math, re, sys, time
from pathlib import Path
import urllib.request, urllib.error, urllib.parse
ROOT = Path(__file__).resolve().parents[1]

PARCELS = "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query"
DEP = "https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/New_Jersey_Environmental_Management_System_Sites/FeatureServer"
SITES, PROGRAMS = DEP + "/143/query", DEP + "/148/query"
NEAR_M = 40  # only used when a site point sits just outside every parcel (geocode drift)
RECENT_YEARS = 10  # NJDEP leaves ACTIVE='Y' on decades-old records, so recency decides "recent"
# Private residences are dropped (names of individuals); roads/public works are kept but never the best lead.
ORG = re.compile(r"\b(INC|LLC|L L C|CORP|CORPORATION|CO|COMPANY|LP|LLP|LTD|GROUP|HOLDINGS|PARTNERS|ENTERPRISES|INDUSTRIES|LOGISTICS|TERMINALS?|TRUCKING|TRANSPORT(ATION)?|DISTRIBUTION|WAREHOUSE|SUPPLY|SERVICES|PRODUCTS|MANUFACTURING|REFINING|SYSTEMS|USA|AMERICA|INTERNATIONAL)\b")
def lead_name(name, program_names):
    """A usable company name: the site name unless it is just an address/building label,
    then an organization-style program (permit) name."""
    bad = lambda n: not n or re.match(r"^\d", n) or "@" in n or re.match(r"^(DISTRIBUTION CENTER|BUILDING|BLDG|LOT|PARCEL|MAINTENANCE BUILDING)\b", n)
    if not bad(name) and ORG.search(name.upper()):
        return name
    for n in program_names:
        if not bad(n) and ORG.search(n):
            return n
    return ""
RESIDENCE = re.compile(r"\b(RESIDENCE|RESIDENTIAL PROPERTY|HOME ?OWNER|PRIVATE RESIDENCE)\b")
PUBLIC = re.compile(r"\b(GARDEN STATE PARKWAY|TURNPIKE|ROUTE \d+|RT \d+|EXIT \d+|NJDOT|DOT\b|ROAD DEPT|COUNTY OF|BOROUGH OF|TOWNSHIP OF|CITY OF|BD OF ED|BOARD OF EDUCATION|SCHOOL|SEWERAGE|AUTHORITY|RAILROAD|CONRAIL|ACCIDENT|SPILL|UNKNOWN|US GOVERNMENT|UNITED STATES|STATE OF NEW JERSEY|MOBILE PARK)\b")

SUFFIX = {"STREET": "ST", "AVENUE": "AVE", "AV": "AVE", "BOULEVARD": "BLVD", "ROAD": "RD", "DRIVE": "DR", "LANE": "LN",
          "HIGHWAY": "HWY", "ROUTE": "RT", "RTE": "RT", "PLACE": "PL", "COURT": "CT", "PARKWAY": "PKWY", "TERRACE": "TER",
          "SUITE": "STE", "FLOOR": "FL", "ROOM": "RM", "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W"}


def norm_addr(s):
    """'700 Jernee Mill Road.' -> '700 JERNEE MILL RD'. Suffixes are standardized, never removed."""
    s = re.sub(r"[^A-Z0-9 &-]", " ", str(s or "").upper())
    s = re.sub(r"\b(STE|SUITE|UNIT|FL|FLOOR|RM|BLDG)\s*\S+", " ", s)
    return " ".join(SUFFIX.get(w, w) for w in s.split())


def addr_numbers(s):
    """'25-53 TALMADGE RD' -> {25,...,53 odd/even}; '300 & 350 KENNEDY DR' -> {300,350}."""
    s = norm_addr(s)
    m = re.match(r"^(\d+)\s*-\s*(\d+)\s+(.*)$", s)
    if m and int(m.group(2)) > int(m.group(1)) and int(m.group(2)) - int(m.group(1)) <= 400:
        a, b = int(m.group(1)), int(m.group(2))
        return set(range(a, b + 1, 2 if (b - a) % 2 == 0 else 1)), m.group(3)
    nums = re.findall(r"\b(\d+)\b(?=\s*(?:&|AND|,|\s[A-Z]))", s)
    street = re.sub(r"^[\d\s&,-]+(AND\s+[\d\s]+)?", "", s).strip()
    return {int(n) for n in nums}, street


def same_address(dep_addr, parcel_addr):
    n1, s1 = addr_numbers(dep_addr)
    n2, s2 = addr_numbers(parcel_addr)
    return bool(n1 & n2) and bool(s1) and s1 == s2


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin(math.radians(lat2 - lat1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def point_in_rings(x, y, rings):
    """Even-odd rule over all rings, so holes are respected."""
    inside = False
    for ring in rings:
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i][:2]
            xj, yj = ring[j][:2]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-15) + xi:
                inside = not inside
            j = i
    return inside


def dist_to_rings_m(x, y, rings):
    best = float("inf")
    for ring in rings:
        for (ax, ay, *_), (bx, by, *_) in zip(ring, ring[1:]):
            scale = math.cos(math.radians(y))
            dx, dy = (bx - ax) * scale, by - ay
            t = 0 if dx == dy == 0 else max(0, min(1, ((x - ax) * scale * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
            best = min(best, haversine_m(y, x, ay + t * dy, ax + t * (bx - ax)))
    return best


def mail_key(street, zip5, city_state=""):
    # Mailing comparisons preserve suites/floors and street types, unlike site street matching.
    st = " ".join(SUFFIX.get(w, w) for w in re.sub(r"[^A-Z0-9]", " ", str(street or "").upper()).split())
    raw_zip = str(zip5 or "").strip()
    if not re.fullmatch(r"\d{5}(?:-?\d{4})?", raw_zip):
        return None
    z = raw_zip.replace("-", "")
    city = " ".join(re.sub(r"[^A-Z0-9]", " ", str(city_state or "").upper()).split())
    if not st or len(z) not in (5, 9):
        return None
    return st + "|" + city + "|" + z[:5]


class RateLimited(RuntimeError):
    pass


class Client:
    def __init__(self, request_interval=1.0):
        self.headers = {"User-Agent": "CapitalRadarPublicResearch/1.0", "Content-Type": "application/x-www-form-urlencoded"}
        self.metadata = {}
        self.counts = []
        self.request_interval = request_interval
        self.last_request = 0.0

    def query(self, url, data, tries=4):
        for n in range(tries):
            try:
                wait = self.request_interval - (time.monotonic() - self.last_request)
                if wait > 0:
                    time.sleep(wait)
                self.last_request = time.monotonic()
                payload = urllib.parse.urlencode({**data, "f": "json"}).encode()
                with urllib.request.urlopen(urllib.request.Request(url, data=payload, headers=self.headers), timeout=45) as r:
                    d = json.load(r)
                if "error" in d:
                    if "too many requests" in str(d["error"]).lower() or d["error"].get("code") == 429:
                        raise RateLimited("Public ArcGIS service temporarily rate-limited the scan")
                    raise RuntimeError("ArcGIS source error: " + str(d["error"].get("message", "unknown")))
                return d
            except Exception as e:
                if n == tries - 1 or isinstance(e, urllib.error.HTTPError) and e.code not in (408, 429, 500, 502, 503, 504):
                    raise
                limited = isinstance(e, RateLimited) or isinstance(e, urllib.error.HTTPError) and e.code == 429
                delay = 5 * (2 ** n) if limited else n + 1
                if isinstance(e, urllib.error.HTTPError):
                    after = e.headers.get("Retry-After", "") if e.headers else ""
                    if after.isdigit():
                        delay = max(delay, int(after))
                if delay > 30:
                    raise RuntimeError("Source requests a longer cooldown; retry later. Previous output retained.") from e
                if limited:
                    print(f"Public source rate limit; retrying after {delay}s", file=sys.stderr, flush=True)
                time.sleep(delay)

    def meta(self, url):
        if url not in self.metadata:
            d = self.query(url.removesuffix("/query"), {})
            fields = {f["name"]: f for f in d.get("fields", [])}
            oid = d.get("objectIdField") or next((f["name"] for f in fields.values() if f.get("type") == "esriFieldTypeOID"), None)
            if not oid or oid not in fields:
                raise RuntimeError("Source object identity metadata unavailable")
            self.metadata[url] = (oid, fields)
        return self.metadata[url]

    def query_all(self, url, data, page=100, cap=20000):
        if type(page) is not int or page < 1 or page > 10000:
            raise ValueError("Choose a positive bounded page size")
        oid, fields = self.meta(url)
        requested = data.get("outFields", "").split(",")
        if not requested or any(f not in fields for f in requested) or "*" in requested:
            raise RuntimeError("Requested field schema is not verified")
        scope = {k: v for k, v in data.items() if k not in ("outFields", "returnGeometry", "outSR")}
        expected = self.query(url, {**scope, "returnCountOnly": "true", "returnGeometry": "false"}).get("count")
        if type(expected) is not int or expected < 0 or expected > cap:
            raise RuntimeError(f"Source scope count {expected} exceeds checked bound {cap}; narrow the scan")
        if expected == 0:
            self.counts.append({"source": url, "expected": 0, "received": 0})
            return []
        listed = self.query(url, {**scope, "returnIdsOnly": "true", "returnGeometry": "false"})
        ids = listed.get("objectIds")
        if not isinstance(ids, list) or len(ids) != expected or len(set(ids)) != expected or any(type(i) is not int for i in ids):
            raise RuntimeError("Source IDs did not reconcile with count")
        out = []
        ids.sort()
        for offset in range(0, len(ids), min(page, 100)):
            batch = ids[offset:offset + min(page, 100)]
            d = self.query(url, {**data, "objectIds": ",".join(map(str, batch)), "outFields": ",".join(dict.fromkeys([oid, *requested])), "resultRecordCount": len(batch), "orderByFields": oid + " ASC"})
            feats = d.get("features")
            if not isinstance(feats, list) or d.get("exceededTransferLimit") or len(feats) != len(batch):
                raise RuntimeError("Source explicit-ID batch truncated")
            got = [f.get("attributes", {}).get(oid) for f in feats]
            if len(set(got)) != len(got) or set(got) != set(batch):
                raise RuntimeError("Source explicit-ID batch repeated or foreign identities")
            out.extend(feats)
        after = self.query(url, {**scope, "returnCountOnly": "true", "returnGeometry": "false"}).get("count")
        if after != expected:
            raise RuntimeError("Source count changed during retrieval")
        self.counts.append({"source": url, "expected": expected, "received": len(out)})
        return out


PARCEL_FIELDS = "PAMS_PIN,PCL_MUN,PCLBLOCK,PCLLOT,PCLQCODE,MUN_NAME,PROP_LOC,PROP_CLASS,CALC_ACRE,LAND_VAL,IMPRVT_VAL,NET_VALUE,OWNER_NAME,ST_ADDRESS,CITY_STATE,ZIP5,ZIP_CODE,SALE_PRICE,DEED_DATE,DEED_BOOK,DEED_PAGE"


def load_parcels(c, pins=None, munis=None, classes=None, min_acres=0):
    common = {"outFields": PARCEL_FIELDS, "returnGeometry": "true", "outSR": "4326"}
    if pins:
        feats = []
        for i in range(0, len(pins), 100):
            where = "PAMS_PIN IN (" + ",".join("'" + p.replace("'", "''") + "'" for p in pins[i:i + 100]) + ")"
            if classes:
                where += " AND PROP_CLASS IN (" + ",".join("'" + k + "'" for k in classes) + ")"
            if min_acres:
                where += f" AND CALC_ACRE >= {float(min_acres)}"
            feats += c.query_all(PARCELS, {**common, "where": where})
    else:
        where = "PCL_MUN IN (" + ",".join("'" + m + "'" for m in munis) + ")"
        if classes:
            where += " AND PROP_CLASS IN (" + ",".join("'" + k + "'" for k in classes) + ")"
        if min_acres:
            where += f" AND CALC_ACRE >= {float(min_acres)}"
        feats = c.query_all(PARCELS, {**common, "where": where})
    out = {}
    allowed = set(classes or ["4B", "4A", "1"])
    for f in feats:
        a, g = f["attributes"], f.get("geometry") or {}
        pin = str(a.get("PAMS_PIN", ""))
        if not re.fullmatch(r"\d{4}_[^_\s]+_[^_\s]+(?:_[^\s]+)?", pin) or pins and pin not in pins:
            raise RuntimeError("Parcel returned an unrelated or invalid qualified identity")
        if a.get("PROP_CLASS") not in allowed or float(a.get("CALC_ACRE") or 0) < min_acres:
            continue
        if not g.get("rings"):
            raise RuntimeError("Parcel geometry missing; no point/address replacement made")
        safe = {k: a.get(k) for k in PARCEL_FIELDS.split(",")}
        if re.match(r"^(PROTECTED|REDACTED|WITHHELD)\b", str(a.get("OWNER_NAME") or ""), re.I):
            for k in ("ST_ADDRESS", "CITY_STATE", "ZIP5", "ZIP_CODE"):
                safe[k] = None
            safe["PROTECTED"] = True
        owner = str(a.get("OWNER_NAME") or "").strip()
        safe["PUBLISHED_ASSESSMENT_ENTITY"] = owner if ORG.search(owner.upper()) and not safe.get("PROTECTED") else ""
        safe.pop("OWNER_NAME", None)
        for ring in g["rings"]:
            if len(ring) < 4 or ring[0][:2] != ring[-1][:2] or any(len(xy) < 2 or type(xy[0]) not in (int, float) or type(xy[1]) not in (int, float) or not (-75.7 <= xy[0] <= -73.7 and 38.7 <= xy[1] <= 41.5) for xy in ring):
                raise RuntimeError("Parcel boundary coordinates invalid")
        if pin in out:
            old = out[pin]
            if any(old.get(k) != safe.get(k) for k in PARCEL_FIELDS.split(",") if k != "OWNER_NAME") or old.get("PUBLISHED_ASSESSMENT_ENTITY") != safe.get("PUBLISHED_ASSESSMENT_ENTITY"):
                old["ATTRIBUTE_CONFLICT"] = True
                old["PUBLISHED_ASSESSMENT_ENTITY"] = ""
            for ring in g["rings"]:
                if ring not in old["rings"]:
                    old["rings"].append(ring)
        else:
            out[pin] = {**safe, "rings": g["rings"]}
    return out


def load_sites(c, munis):
    where = "MUN_CODE IN (" + ",".join("'" + m + "'" for m in munis) + ")"
    feats = c.query_all(SITES, {"where": where, "outFields": "SITE_ID,SITE_NAME,ADDRESS_LINE_1,MUN_CODE", "returnGeometry": "true", "outSR": "4326"})
    out = []
    for f in feats:
        a, g = f["attributes"], f.get("geometry") or {}
        if str(a.get("MUN_CODE", "")).zfill(4) not in munis:
            raise RuntimeError("Foreign municipality in NJDEP response")
        x, y = g.get("x"), g.get("y")
        if x is not None or y is not None:
            if type(x) not in (int, float) or type(y) not in (int, float) or not (-75.7 <= x <= -73.7 and 38.7 <= y <= 41.5):
                raise RuntimeError("NJDEP point coordinates invalid")
        if type(a.get("SITE_ID")) is not int:
            raise RuntimeError("NJDEP site identity invalid")
        out.append({**a, "x": x, "y": y})
    if len({s["SITE_ID"] for s in out}) != len(out):
        raise RuntimeError("Duplicate NJDEP site identities require review")
    return out


def load_programs(c, site_ids):
    progs = {}
    ids = sorted(set(site_ids))
    for i in range(0, len(ids), 200):
        where = "SITE_ID IN (" + ",".join(str(int(s)) for s in ids[i:i + 200]) + ")"
        for f in c.query_all(PROGRAMS, {"where": where, "outFields": "SITE_ID,PI_ID,PI_NAME,PROGRAM_DESC,ACTIVE,START_DATE,END_DATE", "returnGeometry": "false"}):
            a = f["attributes"]
            if type(a.get("SITE_ID")) is not int or type(a.get("PI_ID")) is not int or a.get("SITE_ID") not in ids[i:i + 200]:
                raise RuntimeError("Foreign NJDEP site/program join")
            progs.setdefault(a["SITE_ID"], []).append(a)
    return progs


def parse_date(s):
    if s is None or str(s).strip() == "":
        return None
    for pattern in ("%m/%d/%Y", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return dt.datetime.strptime(str(s).strip(), pattern).date()
        except ValueError:
            pass
    return None


def summarize_site(site, programs, today=None):
    today = today or dt.date.today()
    rows = programs.get(site["SITE_ID"], [])
    active = [p for p in rows if str(p.get("ACTIVE") or "").strip().upper() == "Y" and not str(p.get("END_DATE") or "").strip()]
    dates = [d for p in rows for d in (parse_date(p.get("START_DATE")), parse_date(p.get("END_DATE"))) if d and d <= today]
    names = sorted({(p.get("PI_NAME") or "").strip() for p in rows if p.get("PI_NAME") and not re.match(r"^\d", p["PI_NAME"].strip())})
    latest = max(dates) if dates else None
    recent_cut = dt.date(today.year - RECENT_YEARS, today.month, min(today.day, 28) if today.month == 2 else today.day)
    recent = any(parse_date(p.get("START_DATE")) and recent_cut <= parse_date(p["START_DATE"]) <= today for p in active)
    name = (site.get("SITE_NAME") or "").strip()
    return {
        "name": name,
        "lead": lead_name(name.upper(), names),
        "public": bool(PUBLIC.search(name.upper())),
        "program_names": names[:4],
        "programs": sorted({p.get("PROGRAM_DESC") or "" for p in rows} - {""})[:5],
        "status": ("recent" if recent else "older record") if rows else "no program records",
        "latest": latest.isoformat() if latest else "",
        "site_id": site["SITE_ID"],
    }


def match_sites(parcels, sites):
    """One traceable candidate per site; ambiguous overlaps and shared boundaries stay unassigned.
    Match confidence describes reference linkage, never ownership/current operation probability.
    """
    by_parcel = {pin: [] for pin in parcels}
    boxes = {}
    for pin, p in parcels.items():
        points = [xy for ring in p["rings"] for xy in ring]
        if points:
            boxes[pin] = (min(xy[0] for xy in points), min(xy[1] for xy in points), max(xy[0] for xy in points), max(xy[1] for xy in points))
    for s in sites:
        if RESIDENCE.search((s.get("SITE_NAME") or "").upper()):
            continue
        hit = None
        point = type(s.get("x")) in (int, float) and type(s.get("y")) in (int, float) and math.isfinite(s["x"]) and math.isfinite(s["y"])
        candidates = []
        if point:
            pad_y = (NEAR_M + 2) / 110000
            pad_x = pad_y / max(.1, math.cos(math.radians(s["y"])))
            candidates = [pin for pin, b in boxes.items() if b[0]-pad_x <= s["x"] <= b[2]+pad_x and b[1]-pad_y <= s["y"] <= b[3]+pad_y]
            inside = [pin for pin in candidates if point_in_rings(s["x"], s["y"], parcels[pin]["rings"])]
            edges = [pin for pin in candidates if dist_to_rings_m(s["x"], s["y"], parcels[pin]["rings"]) < 0.02]
            if len(inside) > 1 or len(edges) > 1:
                continue
            if len(inside) == 1 and not edges:
                hit = (inside[0], "inside parcel boundary", "high")
        if not hit:
            same = [pin for pin, p in parcels.items() if s.get("MUN_CODE") and str(s["MUN_CODE"]).zfill(4) == str(p.get("PCL_MUN", "")).zfill(4) and same_address(s.get("ADDRESS_LINE_1"), p.get("PROP_LOC")) and (not point or pin in candidates and dist_to_rings_m(s["x"], s["y"], p["rings"]) <= NEAR_M)]
            if len(same) == 1:
                hit = (same[0], "same street address and municipality; not a title match", "medium")
        if not hit and point:
            near = sorted((dist_to_rings_m(s["x"], s["y"], p["rings"]), pin) for pin in candidates for p in [parcels[pin]])
            near = [n for n in near if n[0] <= NEAR_M]
            if len(near) == 1 or len(near) > 1 and near[1][0] - near[0][0] > 15:
                hit = (near[0][1], f"point {near[0][0]:.0f} m from parcel edge (outside/unverified)", "low")
        if hit:
            by_parcel[hit[0]].append((s, hit[1], hit[2]))
    return by_parcel


def build(args):
    c = Client()
    rows_in, pins = [], None
    if args.csv:
        with open(args.csv, newline="", encoding="utf-8-sig") as fh:
            rows_in = list(csv.DictReader(fh))
        pins = sorted({r["PAMS_PIN"].strip() for r in rows_in if r.get("PAMS_PIN", "").strip()})
    if pins is not None and (not pins or len(pins) > 2000 or any(not re.fullmatch(r"\d{4}_[^_\s]+_[^_\s]+(?:_[^\s]+)?", p) for p in pins)):
        raise ValueError("CSV requires 1–2000 unique qualified PAMS_PIN values")
    if args.muni and (len(args.muni) > 10 or any(not re.fullmatch(r"\d{4}", m) for m in args.muni)):
        raise ValueError("Choose at most ten exact four-digit municipality codes")
    if any(k not in ("4B", "4A", "1") for k in args.classes) or not math.isfinite(args.min_acres) or args.min_acres < 0:
        raise ValueError("Use business-target assessment classes and a nonnegative acreage minimum")
    parcels = load_parcels(c, pins=pins, munis=args.muni, classes=args.classes, min_acres=args.min_acres)
    munis = sorted({p["PCL_MUN"] for p in parcels.values() if p.get("PCL_MUN")})
    if not parcels:
        return [], {"parcels": 0, "sites_downloaded": 0, "sites_matched": 0, "munis": [], "source_counts": c.counts}
    print(f"Retrieved {len(parcels)} business-target parcels; checking {len(munis)} municipalities", file=sys.stderr, flush=True)
    sites = load_sites(c, munis)
    print(f"Retrieved {len(sites)} regulatory site references; matching geometry/address evidence", file=sys.stderr, flush=True)
    matched = match_sites(parcels, sites)
    programs = load_programs(c, [s["SITE_ID"] for v in matched.values() for s, _, _ in v])

    groups = {}
    for pin, p in parcels.items():
        k = mail_key(p.get("ST_ADDRESS"), p.get("ZIP5") or p.get("ZIP_CODE"), p.get("CITY_STATE"))
        if k:
            groups.setdefault(k, []).append(pin)

    checked = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    order = pins or sorted(parcels, key=lambda k: -(parcels[k].get("CALC_ACRE") or 0))
    out = []
    for pin in order:
        p = parcels.get(pin)
        base = {"INPUT_" + k: v for r in rows_in if r.get("PAMS_PIN", "").strip() == pin for k, v in r.items() if k != "PAMS_PIN"}
        if not p:
            out.append({**base, "PAMS_PIN": pin, "STATUS": "Not returned for requested business-class/acreage scope; source absence not established"})
            continue
        k = mail_key(p.get("ST_ADDRESS"), p.get("ZIP5") or p.get("ZIP_CODE"), p.get("CITY_STATE"))
        peers = [x for x in groups.get(k, []) if x != pin] if k else []
        found = sorted(((summarize_site(s, programs), how, conf) for s, how, conf in matched[pin]),
                       key=lambda t: ({"high": 0, "medium": 1, "low": 2}[t[2]], {"recent": 0, "older record": 1}.get(t[0]["status"], 2), "".join(chr(255 - ord(ch)) for ch in t[0]["latest"])))
        cur = [f for f in found if f[0]["status"] == "recent"]
        old = [f for f in found if f[0]["status"] != "recent"]
        good = [f for f in found if f[2] != "low" and not f[0]["public"] and f[0]["lead"]]
        fmt = lambda f: f"{f[0]['name']} [{f[0]['status']}; {', '.join(f[0]['programs']) or 'no programs'}; latest {f[0]['latest'] or 'n/a'}; {f[1]}; {f[2]} confidence; NJDEP site {f[0]['site_id']}]"
        out.append({
            **base,
            "PAMS_PIN": pin, "MUNICIPALITY": p.get("MUN_NAME"), "BLOCK": p.get("PCLBLOCK"), "LOT": p.get("PCLLOT"), "QUAL": p.get("PCLQCODE") or "",
            "PROPERTY_ADDRESS": p.get("PROP_LOC"), "CLASS": p.get("PROP_CLASS"), "ACRES": p.get("CALC_ACRE"),
            "LAST_SALE_PRICE": p.get("SALE_PRICE") or "", "DEED_DATE": p.get("DEED_DATE") or "", "DEED_BOOK_PAGE": f"{p.get('DEED_BOOK') or ''}/{p.get('DEED_PAGE') or ''}".strip("/"),
            "OWNER_NAME_STATE_LAYER": "Not collected as a verified owner; consult source tax/deed records",
            "PUBLISHED_ASSESSMENT_ENTITY": p.get("PUBLISHED_ASSESSMENT_ENTITY", ""),
            "ASSESSMENT_NAME_STATUS": "published-assessment-observation" if p.get("PUBLISHED_ASSESSMENT_ENTITY") else "protected" if p.get("PROTECTED") else "no-published-organization-name",
            "TAX_BILL_MAILING": (", ".join(filter(None, [p.get("ST_ADDRESS"), p.get("CITY_STATE"), str(p.get("ZIP5") or p.get("ZIP_CODE") or "")])) if args.full_mailing else (p.get("CITY_STATE") or "")),
            "SAME_MAILING_AS": "; ".join(peers[:15]) + (f" (+{len(peers) - 15} more)" if len(peers) > 15 else ""),
            "SAME_MAILING_COUNT": len(peers),
            f"NJDEP_RECENTLY_DATED_REFERENCES_LAST_{RECENT_YEARS}_YEARS": " | ".join(fmt(f) for f in cur[:5]),
            "OLDER_NJDEP_RECORDS": " | ".join(fmt(f) for f in old[:5]),
            "BEST_LEAD": (good[0][0]["lead"] + ("" if good[0][0]["status"] == "recent" else f" (older record, {good[0][0]['latest'][:4] or 'undated'})")) if good else "",
            "BEST_LEAD_CONFIDENCE": good[0][2] if good else "",
            "BEST_LEAD_SITE_ID": good[0][0]["site_id"] if good else "",
            "BEST_LEAD_MATCH_METHOD": good[0][1] if good else "",
            "BEST_LEAD_RECORD_DATE": good[0][0]["latest"] if good else "",
            "BEST_LEAD_NAME_ROLE": ("regulatory-site-name" if good[0][0]["name"].upper() == good[0][0]["lead"].upper() else "regulatory-program-interest-name") if good else "",
            "CHECKED_AT": checked,
            "SOURCES": "NJGIN public business-target assessment; NJDEP regulatory references",
            "PARCEL_SOURCE_URL": PARCELS + "?" + urllib.parse.urlencode({"where": "PAMS_PIN = '" + pin.replace("'", "''") + "'", "outFields": "PAMS_PIN,PROP_LOC,PROP_CLASS", "returnGeometry": "false", "f": "pjson"}),
            "NJDEP_SOURCE_URLS": " | ".join(SITES + "?" + urllib.parse.urlencode({"where": "SITE_ID = " + str(f[0]["site_id"]), "outFields": "SITE_ID,SITE_NAME,ADDRESS_LINE_1", "returnGeometry": "false", "f": "pjson"}) for f in found),
            "NOTE": "Heuristic regulatory/address reference leads, not verified owners, current operators or acquisition contacts. Recency is a source-record date, not proof of business activity. Shared mailing is not common ownership. Assessment class is not zoning. Attribute conflict: " + str(bool(p.get("ATTRIBUTE_CONFLICT"))),
        })
    return out, {"parcels": len(parcels), "sites_downloaded": len(sites), "sites_matched": sum(len(v) for v in matched.values()), "munis": munis, "source_counts": c.counts, "scope": "municipality-wide" if not pins else "exact supplied parcel IDs (not an OZ inclusion determination)"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv"); ap.add_argument("--muni", type=lambda s: [m.strip() for m in s.split(",")])
    ap.add_argument("--classes", type=lambda s: [k.strip().upper() for k in s.split(",")], default=["4B", "4A", "1"])
    ap.add_argument("--min-acres", type=float, default=0); ap.add_argument("--out", default=str(ROOT / ".radar/oz-research/nj-parcel-leads.csv"))
    ap.add_argument("--full-mailing", action="store_true", help="include the mailing street line (off by default)")
    args = ap.parse_args()
    if bool(args.csv) == bool(args.muni):
        ap.error("give exactly one of --csv or --muni")
    dest = Path(args.out).resolve()
    if dest.is_relative_to(ROOT) and not dest.is_relative_to(ROOT / ".radar"):
        ap.error("Repository output stays local under .radar; public assets and owner indexes cannot be overwritten")
    rows, stats = build(args)
    cols = list(dict.fromkeys(k for r in rows for k in r)) or ["PAMS_PIN", "STATUS"]
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp = dest.with_name(dest.name + ".tmp")
    with temp.open("w", newline="", encoding="utf-8") as fh:
        temp.chmod(0o600)
        w = csv.DictWriter(fh, fieldnames=cols); w.writeheader()
        for row in rows:
            w.writerow({k: ("'" + str(v) if re.match(r"^[=+\-@\t\r]", str(v or "")) else v) for k, v in row.items()})
    temp.replace(dest)
    dest.with_suffix(".coverage.json").write_text(json.dumps({**stats, "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(), "complete_for_scope": True, "caveat": "Counts reconcile for requested source scope, not coverage of ownership, current operators or OZ qualification."}, indent=2) + "\n")
    print(json.dumps({**stats, "rows_written": len(rows), "with_lead": sum(1 for r in rows if r.get("BEST_LEAD")), "out": args.out}))


if __name__ == "__main__":
    sys.exit(main())
