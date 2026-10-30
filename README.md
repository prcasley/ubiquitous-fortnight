# Capital Radar

A map-first property research workspace using public GIS in New Jersey, selected Florida counties, and prepared Lehigh/Northampton PA county adapters. PA live service verification remains pending because the execution environment blocks those county hosts. Open the [GitHub Pages app](https://prcasley.github.io/ubiquitous-fortnight/). Public services can be incomplete or unavailable; assessment records do not establish title, zoning approval or availability for sale.

## Available now

- Search first on phones, a mobile navigation menu, 44-pixel button targets, and a large desktop street/satellite map, expandable map view, parcel identify, GPS and plain-English parcel search. Property cards appear in chat with mapped outlines, Google Maps/Street View links and field-trip actions.
- Public assessment-name lookups without a data-provider account. Organization-style names can be researched for up to 25 visible parcels at a time, with explicit stop control. Individual names remain selected-record observations, outside the saved company directory. NJ's connected layer redacts names.
- Browser-local company dossiers, same-name parcel observations, dated registry/deed references and manually cited business contacts. Matching names do not prove common control. These notes are excluded from hosted summaries.
- Saved searches, parcel notes, selected-parcel FEMA flood / USFWS wetlands screening adapters and manual dated zoning, flood, wetlands, access, power and fiber observations. Source errors and unchecked coverage remain visible.
- Persistent assemblies of up to 30 parcels, reported-acreage sums, geometry connectivity/overlap checks, and CSV/GeoJSON exports preserving polygon holes. No inferred legal adjacency or unique land-area claim.
- Read-only local CSV comp imports, nearby comparison (default three miles) and closed-sale price per building square foot when both price and building area exist. Asking prices and leases remain separate. No transaction dataset or live listing feed is bundled.
- Ordered field trips, notes, photos, backups and printable HTML/PDF field packs with parcel imagery. Dated organization observations and manual screening notes can accompany the selected property.
- Optional hosted summaries through an authenticated server. Executives see a property-research workflow; API keys remain on the server and no model is downloaded. Static Pages searches work without that backend.

See the [October 28 CEO acceptance review](docs/CEO_REVIEW_2026-10-28.md), [executive acquisition tests](docs/EXECUTIVE_ACQUISITION_QA.md), [free sources, restored features and paid-data gaps](docs/FREE_SOURCES_AND_FEATURES.md), [coverage](docs/PUBLIC_DATA_COVERAGE.md), [chat examples](docs/CHAT_GUIDE.md), and [field packs](docs/FIELD_PACKS.md).

## Run locally

Use Node 22.13 or newer:

```sh
npm ci
npm run build
npm test
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000. Browser integration checks use `python3 tests/browser-smoke.py` with Python Playwright and Chromium installed. The optional authenticated research server is described in [development](docs/DEVELOPMENT.md) and [deployment](docs/DEPLOYMENT.md).

The Pages workflow builds `dist/` on pushes to main. Selected pinned runtime assets are also tracked for repository-root Pages configurations. Never commit credentials, licensed datasets, portfolio spreadsheets or exported private research.

## Data and verification

Palm Beach uses county parcel polygons; Broward and Miami-Dade have county adapters; Martin/St. Lucie use the slower Florida statewide centroid fallback. NJ uses statewide public polygons. Source projections, availability and verification limits are listed in the coverage document. Broad nationwide coverage, verified LLC principals, contact enrichment, listings, leases and national sales/mortgage histories are not supplied by this app.

Public data is requested on demand; no bulk owner database is published here. Local dossiers, comps, notes and photos stay in the browser until the user exports them. Optional hosted summaries use a bounded allowlist of public parcel facts, excluding owner lookups, contacts, notes and imported files. A separate authenticated workspace supports explicitly permitted licensed imports without bundling vendor data.

Automated unit and mocked browser checks validate the implemented workflows; Palm Beach live queries have also been sampled. They do not establish nationwide source accuracy, physical-phone behavior or successful deployment of a hosted backend. No production backend is provisioned yet.

Sprint 1 chat behavior, live observations and outstanding acceptance gates: [October 28 acceptance record](docs/SPRINT1_ACCEPTANCE_2026-10-28.md).

[Acquisition shortlists: use, evidence rules and government-source coverage limits](docs/ACQUISITION_SHORTLISTS.md).

[October 28 Deal Nav, flood/ranking corrections, KML and OZ evidence limits](docs/DEAL_NAV_AND_RELIABILITY_2026-10-28.md).

Latest reliability update: [Easton, cross-border neighborhoods and OSM screening](docs/EASTON_RELIABILITY_2026-10-29.md).

Latest executive interface: [Entry screen, industrial brief and NJ record corrections](docs/EXECUTIVE_ENTRY_2026-10-29.md).

Recovered historical reference data and local review: [setup and data boundaries](docs/LOCAL_RECOVERED_REFERENCE.md).

Latest publication and reliability notes: [restored references, Northampton identity and batched footprints](docs/EASTON_AND_FOOTPRINT_BATCH_2026-10-29.md).

Latest tested improvements: [review first pass — GIS resilience, focus and backend hardening](docs/REVIEW_FIRST_PASS_2026-10-30.md).
