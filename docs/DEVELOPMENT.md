# Development and licensed-data integration

## Run the public scanner

Use the existing checkout; cloud tasks are already isolated. Node >=22.13 is required (validated here with Node 24.19). Install and build with:

```sh
npm ci --cache /tmp/radar-npm-cache
npm run build
npm test
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

`npm run build` creates `dist/` and prepares local Leaflet/Turf assets. These generated files are ignored. Rebuild after changing source files. No external CDN is needed for map code; actual basemap tiles, geocoding and GIS queries still need their source services.

For deterministic browser checks:

```sh
python3 -m pip install -r requirements-dev.txt
python3 -m playwright install chromium
python3 tests/browser-smoke.py
```

The browser test uses local synthetic fixtures and blocks unrelated external requests. It checks the real generated queries, classification, jurisdiction identity, environmental intersections, saved-search restore, export, reload persistence, failed/partial scans, stale-response cancellation and dependency failure. It does not establish public-service availability or actual property accuracy.

## What is implemented

- Explicit acreage operators: under, at most, over and at least in the controls; parsed under/over/at-least requests use the same query semantics.
- Provider/jurisdiction-scoped IDs and active-source selection independent of old results.
- Polygon/circle intersection for radius membership; published points remain point observations. The circle is approximated with 96 segments.
- Explicit idle/loading/partial/complete/failed/cancelled/identified result states; cancelled responses cannot overwrite a new scan.
- Browser-local parcel snapshots, notes and saved filters. JSON exports preserve source, observation time, scan status, geometry precision and screening results. These public snapshots exclude owner-name lookups and licensed backend data.
- FEMA NFHL and USFWS NWI screening adapters with metadata/schema checks, count/transfer-limit checks, timeouts and visible failure states. Polygon overlap uses geodesic area and a union of clipped hazards to avoid double counting. Centroid screens never report a parcel overlap percentage.
- An authenticated local research server, persistent SQLite imports/lists, private parcel search/map, supplied sale/mortgage/relationship histories and import-triggered change alerts.
- Hosted public-record summaries without browser model downloads. See [HOSTED_ASSISTANT.md](HOSTED_ASSISTANT.md) for secure administrator configuration and activation requirements.

Browser storage is local to the device/profile/origin, has finite capacity and can be cleared by the browser. Export backups. It does not synchronize with the private server. Screening is user-initiated for the selected parcel, not a background statewide job.

## Environmental-source limitations

The FEMA and USFWS endpoints are configured source candidates, not live-verified integrations in this environment. The proxy returned HTTP 403 for both destinations. Runtime metadata must report the expected polygon geometry and required fields before results are accepted. A source response with no mapped intersection still has `coverage: not-established`; it is not a finding that the site is flood-free or wetland-free.

Source last-edit timestamps, when available, are dataset metadata, not automatically the effective flood-map date or imagery acquisition date. Use the linked official records to confirm effective coverage and vintage. Public polygons are planning evidence, not a legal boundary survey. No power-capacity or broadband-service feasibility check has been implemented.

Required additional destinations: `hazards.fema.gov` and `fwspublicservices.wim.usgs.gov`. Existing scanner destinations include the ArcGIS parcel/geocoder hosts and selected basemap providers. Keep TLS verification enabled.

## Private research server

Set `RADAR_WORKSPACE_PASSWORD` securely in the process environment; do not commit it, print it, or put it in a script. It must have at least 16 characters. Then:

```sh
npm run build
npm start
```

The server listens only on `127.0.0.1`, default port 8080 (`PORT` overrides it). Open the `/workspace.html` path using a supported local development browser; authenticate as username `radar` with the configured password. The server also serves the public scanner. In cloud onboarding, validate with internal requests; do not create localhost preview links.

The default database is `.radar/research.sqlite`; `RADAR_DB_PATH` may point to a private location outside the static output and public source tree. Back up that database. It is excluded from Git and never served as a static file. Authentication is one shared local workspace identity, not multi-user SSO. For production, use an authenticated HTTPS reverse proxy and implement appropriate user/tenant permissions, operational monitoring and deployment controls. Do not expose the loopback service directly.

API routes (all authenticated):

| Route | Purpose |
|---|---|
| `GET /api/health` | Server and imported-provider status |
| `GET /api/providers` | Per-provider imported counts; missing providers explicitly unconfigured |
| `GET /api/parcels` | Filters: state, countyFips, provider, type, q, minAcres, maxAcres, offset; stable 100-record pages |
| `GET/POST /api/lists` | Saved parcel keys, search filters and notes |
| `DELETE /api/lists/:id` | Remove a saved list |
| `GET /api/alerts` | Most recent 100 changes detected during imports for saved records/searches |

There is no arbitrary URL proxy and no HTTP import/upload endpoint. No automatic provider polling, email delivery, private-data export or paid API calls are implemented. Search is over imported records only; an empty response is not evidence of no property nationwide.

## Prepare a provider integration without an account

The implemented boundary accepts **normalized licensed exports**, not an invented or unverified vendor API. Regrid, ReportAll, ATTOM and Reonomy are supported provider identifiers for import provenance; naming one does not establish access, product compatibility or a contract. All begin as unconfigured with zero records.

Choose one parcel foundation after testing NJ/PA/FL samples. Confirm that the purchased package permits the exact fields, local storage, searching, geometry display, retention and intended users. A UI-only subscription may not permit any of these uses. A feed's license declaration records an operator's assertion; the code cannot determine contractual entitlement.

Convert a permitted provider export into this format outside the public repository:

```json
{
  "version": 1,
  "provider": "regrid",
  "license": {
    "reference": "Your reviewed agreement or order reference",
    "localStorage": true,
    "search": true,
    "export": false
  },
  "records": [{
    "state": "NJ",
    "countyFips": "34023",
    "parcelId": "SYNTHETIC-EXAMPLE-ONLY",
    "address": "Synthetic example, not an actual property record",
    "type": "Industrial",
    "acres": 3,
    "ownerName": null,
    "yearBuilt": null,
    "geometry": null,
    "sourceURL": "https://example.com/synthetic-source",
    "observedAt": "2026-01-01T00:00:00Z",
    "sales": [],
    "mortgages": [],
    "relationships": []
  }]
}
```

Then run:

```sh
node server/import.mjs /private/path/normalized-provider-feed.json
```

Imports are atomic batches of up to 100,000 records. Repeated identities update in place; unmentioned records remain. A refresh is an upsert, not a complete replacement or a parcel split/merge reconciliation. Geometry, when supplied, must be valid WGS84 Point/Polygon/MultiPolygon. Source fields need a credential-free HTTPS URL and a parseable observation date. County FIPS is required for licensed records. The public FDOR adapter retains its provider-specific county code within the provider-scoped identity; these are not automatically reconciled across vendors.

Supplied `sales`, `mortgages` and `relationships` entries must each include `sourceURL` and `observedAt`. Relationships also require `evidence` and a `reported` or `verified` status. These values describe the supplied source claim; the app does not independently verify title, LLC control, debt balances, current occupancy, contacts or lease expiration. Empty histories mean not supplied, not no history. No relationships are inferred from matching names or addresses.

Import alerts compare recorded property/history changes against saved parcel keys and filters, including properties leaving a saved filter. Reimporting unchanged facts does not generate another alert. Alerts run only when an import runs and are shown on page reload. They do not claim live monitoring. Schedule permitted feed refreshes only after a provider delivery method and contract are confirmed.

When an account is available, add a provider-specific adapter using that product's current official schema/authentication. Keep credentials server-side and test actual field coverage, paging, cost/quota behavior, source dates and permitted storage before enabling it. This release makes no live vendor-API compatibility claim.

## Static deployment

Deploy the built **`dist/` artifact**, rather than raw repository root. The included `pages-build.yml` workflow is manual-only; configure GitHub Pages to use GitHub Actions and explicitly run that workflow when ready to publish. No deployment was performed as part of this change. Static Pages does not run SQLite, authenticated API routes or hosted assistant requests. Licensed data stays in private server storage.

## Remaining work requiring external prerequisites

- Apply network access and validate FEMA/NWI and NJ/FL sources on real parcels, including coverage and effective dates.
- Select a licensed provider and supply an approved feed or scoped API credentials securely. Test national coverage and commercial-record completeness before claiming either.
- Obtain permitted commercial histories/entity data before claiming Reonomy-like ownership intelligence.
- Production SSO/multi-user hosting, provider-specific polling and notifications, power/broadband screening, split/merge reconciliation and larger-scale spatial indexing remain later work. SQLite is the local pilot store; move to PostGIS when data volume, polygon search or multi-user operations justify it.
