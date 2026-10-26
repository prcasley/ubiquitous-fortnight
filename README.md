# Capital Radar | Public GIS Research (No Transactions)

## Development update

The public scanner now includes corrected search operators and source selection, explicit scan states, browser-saved research/notes/exports, and selected-parcel flood/wetlands screening adapters. A separate authenticated local workspace supports permitted licensed-data imports, parcel search/maps, supplied histories and import change alerts. No licensed dataset or live vendor account is bundled. Environmental source endpoints still need live validation; unavailable coverage is never a clearance.

Run `npm ci`, `npm run build`, and `npm test`. Serve the generated `dist/` folder for the static app. Pinned runtime assets are also tracked for existing repository-root Pages deployments. See [development, testing, deployment and provider setup](docs/DEVELOPMENT.md) for the current workflow and limits. Historical feature/verification notes below describe the public scanner and do not establish new live-service validation.

This public, static-browser interface performs **read-only queries to official state GIS layers**. It is not a private property-screening application, does not use any internal candidate lists, and does not include comparable sales, transaction amounts, contact dossiers, ownership-inference scores or confidential business records.

## Sources and coverage

- [Florida statewide parcel centroid layer, FDOR Cadastral Centroids 2026](https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0), a public ArcGIS service joined to DOR assessment attributes. **Only public records for Palm Beach (CO_NO 60), Martin (53), and St. Lucie (66)** are queried. Industrial assessment-use codes 040–049 and vacant land 010/040 are accepted in their three- and four-digit variants. Display acreage is LND_SQFOOT / 43,560. Point geometry is not legal parcel boundary evidence. Current service metadata identifies it as a **2026** layer; older service descriptions can still refer to August 2025 submission processing.
- [New Jersey NJGIN statewide parcel/MOD-IV composite](https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0). Public geometry, assessment class, acreage and published parcel ID only. NJ owner fields are redacted and not queried. Uses parcel polygon geometry for map display, not a legal survey.
- [Leaflet 1.9.4](https://leafletjs.com/download) for map rendering, pinned with SRI for CSS and JS. OpenStreetMap and Esri provide basemap tiles; attribution is shown.

**Source retrieval date:** No bulk county source data has been downloaded or embedded as part of this build. Source data is queried **on demand** when a user scans. The acquisition timestamp for each successful scan is shown on screen. External downloads must record a real retrieval timestamp before any source-data files are published.

## Privacy and architecture

- **Florida owner names are NOT requested during bulk parcel searches.** One user-initiated parcel-detail lookup can retrieve that individual parcel's published assessment name directly from the Florida official source. Mailing addresses are never requested, and no owner-name index is stored or published in this repository.
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

Run `npm ci` and `npm run build`, then deploy the generated `dist/` artifact. The GitHub Pages build workflow supports this on pushes to main or a manual dispatch; see `docs/DEVELOPMENT.md`. Raw root deployment omits generated dependencies. Never upload licensed datasets, internal/company-selected records or credentials to this public repository.
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
- Hosted result summaries run through the authenticated application server. The executive UI has no provider/model controls, downloads or GPU setup. GitHub Pages cannot run those server routes. See [hosted assistant setup](docs/HOSTED_ASSISTANT.md); live hosted inference has passed a synthetic backend check; production deployment remains outstanding.

See [public data coverage and state-source backlog](docs/PUBLIC_DATA_COVERAGE.md) and [hosted research assistant setup](docs/HOSTED_ASSISTANT.md).

**Verification state:** Local static checks and source schema inspections support the code paths. The new OZ reference layers, CORS responses, selected county filters and end-to-end phone behavior have **not** passed authoritative on-device live scans. Do not report them as production-verified until that happens. The pull request includes zero-network GitHub Actions checks to catch unsafe field projection and obvious regressions.


## Live scanner and hosted research summaries

**Palm Beach County reliability:** A diagnostic GitHub Actions runner confirmed that Florida's 2026 statewide layer responds to metadata but timed out after 40 seconds on both a one-record and a small-area query. The new primary Palm Beach parcel service instead returned 10 county warehouse records in about 2 seconds, and a realistic five-mile industrial query returned 150 GIS features in about nine seconds, with permissive public CORS headers. These were real *network-source tests*, not a claim that the web UI has been validated on every phone.

- **Palm Beach primary:** [Parcels and Property Details (county public GIS)](https://services1.arcgis.com/ZWOoUZbtaYePLlPw/arcgis/rest/services/Parcels_and_Property_Details_WebMercator/FeatureServer/0), supports reported acreage, `PROPERTY_USE` text, `YRBLT`, public parcel geometry and on-demand `OWNER_NAME1`.
- **Martin / St. Lucie:** the statewide fallback remains subject to documented query slowness. Do not treat those counties as performance-verified until suitable county or new state API sources are tested.
- The Palm Beach scanner requests county parcels in numbered pages and shows returned records as they arrive. When its feature cap is reached, it shows a partial-results warning rather than saying no property was found.
- The industrial assessment filter recognizes warehouse/distribution/manufacturing terms but excludes the unrelated `DISTRICTS` category. Assessors' descriptive land uses are not zoning approvals.
- Each Florida property card provides an explicit **Look up published assessment name** action. It requests only a single parcel's official assessment-owner name, not mailing addresses, private contacts, or a bulk public person index. It does not establish deeded or beneficial ownership.
- New Jersey's statewide service redacts names. Property cards link to New Jersey's own Property Tax/Property Explorer portal for independent source research; the app does not scrape protected persons' details.

**Hosted assistant:** Executives select **Explain these results** after a completed search. A server-side integration sends a limited public-record sample and returns an advisory summary with source provenance. No model is downloaded to the laptop. Administrator configuration, a valid hosted API key/model and an approved persistent authenticated host are required; live inference passed a synthetic authenticated backend check on October 26, 2026; no production deployment is claimed.

**Still excluded:** proprietary portfolio lists, internal business data, contact dossiers, comps, sale/lease transaction amounts, and property-value estimates.

**Testing gate:** The repo includes automated static tests and official public source network probes. The latter are not a substitute for validating the published GitHub Pages interface on a physical iPhone or a configured live hosted summary service.
