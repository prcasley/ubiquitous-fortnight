# Capital Radar | Public GIS Research (No Transactions)

This public, static-browser interface performs **read-only queries to official state GIS layers**. It is not a private property-screening application, does not use any internal candidate lists, and does not include comparable sales, transaction amounts, contact dossiers, ownership-inference scores or confidential business records.

## Sources and coverage

- [Florida statewide parcel centroid layer, FDOR Cadastral Centroids 2026](https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0), a public ArcGIS service joined to DOR assessment attributes. **Only public records for Palm Beach (CO_NO 60), Martin (53), and St. Lucie (66)** are queried. Industrial assessment-use codes 040–049 and vacant land 010/040 are accepted in their three- and four-digit variants. Display acreage is LND_SQFOOT / 43,560. Point geometry is not legal parcel boundary evidence. Current service metadata identifies it as a **2026** layer; older service descriptions can still refer to August 2025 submission processing.
- [New Jersey NJGIN statewide parcel/MOD-IV composite](https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0). Public geometry, assessment class, acreage and published parcel ID only. NJ owner fields are redacted and not queried. Uses parcel polygon geometry for map display, not a legal survey.
- [Leaflet 1.9.4](https://leafletjs.com/download) for map rendering, pinned with SRI for CSS and JS. OpenStreetMap and Esri provide basemap tiles; attribution is shown.

**Source retrieval date:** No bulk county source data has been downloaded or embedded as part of this build. Source data is queried **on demand** when a user scans. The acquisition timestamp for each successful scan is shown on screen. External downloads must record a real retrieval timestamp before any source-data files are published.

## Privacy and architecture

- **Florida raw owner fields are NOT requested from the browser.** The public GIS service includes names of individuals, so client-side regex hiding would not protect them from the browser network inspector. An offline-reviewed company-only export may be added separately, but none is included here.
- No New Jersey owner-name harvesting and no data from county tax lists.
- No transactions, sale/lease comps, price fields, contact records, private parcel shortlists, selected company leads, property value estimates or internal business notes. These fields are excluded from the ArcGIS query projections, UI and export functions.
- No private API keys or SharePoint/Power BI/CRM connection.

## Current features

- Mobile street/satellite map and GPS selection (browser permission required).
- Industrial/vacant assessment-class and acreage filters; location-aware source search in selected Florida counties and NJ statewide.
- Read-only parcel detail cards with source vintage, parcel ID and map precision notice.
- Local deterministic search-summary assistant for the last completed scan.
- Protective count cap of 1,100 features; oversized or clipped searches are reported as incomplete, not as zero properties.

## Limits and testing

A public ArcGIS service may be unavailable, rate-limited, or blocked by client network policy or CORS. GeoJSON and rendering behavior must be verified on the live deployed site. Assessors' use classes are NOT zoning confirmation. The map is not a survey, and it cannot prove ownership, availability or legal title.

**Verification:** Code-level and offline simulated tests are possible. Live ArcGIS retrievals, browser CORS, on-device GPS and parcel-record accuracy have not been demonstrated by the package author. Do not claim success until verified on the actual deployed site.

## Static deployment

Deploy `index.html` and `assets/radar-live.css`, `assets/radar-live.js` to GitHub Pages from `main` and `/ (root)`. Never upload proprietary application code or internal/company-selected records to this public repository.
## Next-generation public executive experience (feature branch)

This branch adds a natural-language **rule-driven** executive assistant: ask for industrial parcels over a specified acreage near an NJ/FL municipality, filter industrial/vacant/multifamily classes, and interrogate source provenance. It does not invent parcels or perform cloud generative inference. The existing source scanner remains the system of record.

- A state-aware county selector displays all 21 NJ counties with public statewide-source support, and currently connected Florida counties Palm Beach, Martin, and St. Lucie. Additional Florida counties appear as **planned, disabled**, not falsely supported.
- For a typed city, the geocoder's actual county field determines the source filter. If the geocoder does not supply a recognized county, the scan stops rather than using a guessed county center.
- Show source-supported actual year built, FL effective year built, assessment building area and residential units when present. An effective construction year is **not proof of a remodel**. Remodel dates and lease expirations remain explicitly unavailable.
- Filter apartments/multifamily by public *assessment class*, not zoning designation or verified number of units. No ability to infer whether a parcel is listed for sale or a tenant is willing to sell.
- Street, satellite, topographic, and dark maps; individual parcel identify mode; public-record labels and map attributions.
- OZ 1 reference layer based on a federal spatial service and OZ 2 **third-party eligibility reference** with tract GEOIDs. OZ 2 reference polygons do NOT establish official Treasury designation or certification.
- A session-only parcel grouping tray for observed acreage sums. Selecting neighboring map parcels does not prove adjacency, unified title or assemblage feasibility.
- Optional voice dictation with explicit browser/service warning; text input remains the accessible default.
- An optional NVIDIA Nemotron inference gateway lives in `server/` but is disabled and **does not run on GitHub Pages**. It needs approved private infrastructure, inference compute, authenticated reverse proxy and source-validation QA. No model keys are bundled.

See [public data coverage and state-source backlog](docs/PUBLIC_DATA_COVERAGE.md) and [NVIDIA agent research and deployment roadmap](docs/NVIDIA_AGENT_ROADMAP.md).

**Verification state:** Local static checks and source schema inspections support the code paths. The new OZ reference layers, CORS responses, selected county filters and end-to-end phone behavior have **not** passed authoritative on-device live scans. Do not report them as production-verified until that happens. The pull request includes zero-network GitHub Actions checks to catch unsafe field projection and obvious regressions.
