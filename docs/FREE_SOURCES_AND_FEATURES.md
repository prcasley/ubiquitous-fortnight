# Free-source build and feature comparison — October 26, 2026

## Implemented in this build

The static app now uses a wide map with a compact chat/results sidebar, collapsed filters and an Expand map action (Escape closes it). Mobile places chat first and provides a navigation menu. Visible buttons have a 44-pixel minimum target height. These changes work in the Pages build without an application host.

Public parcel searches remain separate from assessment-name research. A selected parcel can request its published name from the official source. An explicit batch action checks up to 25 visible Florida records, two requests at a time, with Stop control. Organization-style names become local company observations; selected-record individual names are not added to the saved directory. Mailing addresses are not requested. There is no contact-enrichment API or person-search scraper.

Company dossiers group normalized published names within a state, show the observed parcels and source/retrieval dates, and accept user-entered registry/deed evidence, notes and cited business contacts. The four-item evidence checklist measures research completeness only. Same-name groups do not establish a single legal entity, common control or beneficial ownership. Export the ownership JSON to preserve a private copy; automatic merging of that backup or old pilot dossiers is not implemented.

Research tools include persistent 30-parcel assemblies, reported acreage, polygon connectivity and overlap counts, CSV/GeoJSON exports preserving holes, manual dated screening notes, contact-free research queue CSV, and local CSV comp imports. Closed-sale price per building SF uses supplied sale price / building SF. Asking prices, rents, land acreage and lease renewals are not interchangeable. Radius comparison defaults to three miles; records missing coordinates are identified and excluded from that radius result.

Field packs retain ordered stops, photos and notes. Dated organization observations are included when the property is added after the lookup; manual screening updates synchronize into an existing stop. Existing trip backups continue to merge. No recovery-package property records, contacts or spreadsheets were published or imported.

## Free data available and gaps

| Source | Current use | Practical limit |
|---|---|---|
| Palm Beach public GIS | Parcel polygons, published acreage/use/year and separate `OWNER_NAME1` lookup | Live schema and one owner record verified; assessment name is not deeded title |
| Broward public taxroll | County parcel adapter; separate `NAME_LINE_1` lookup adapter | Current source verification blocked by this environment; connected projection lacks acreage, so acreage searches stop with an explanation |
| Miami-Dade public GIS | County parcel adapter, lot-size acreage and separate `TRUE_OWNER1` adapter | Current source verification blocked by this environment |
| FL statewide assessment centroids | Martin/St. Lucie fallback; county-qualified `OWN_NAME` lookup | Slow queries; point locations cannot establish parcel boundaries; no statewide performance claim |
| NJGIN | Statewide parcel polygons and assessment attributes | Names redacted in connected layer; official property-research portal provided, no inferred owner |
| FEMA / USFWS | Selected-parcel flood and wetlands screening adapters | Coverage/vintage must be checked; errors and missing maps are not clearance |
| EIA / FCC | Official map links and manual source/date/observation forms | No automated power capacity, utility availability or address-level broadband API connection |

No provider account/key is required for the connected public GIS requests. Source usage conditions, rate limits and availability still apply. Endpoint access alone does not grant unrestricted bulk redistribution rights.

## GitHub dataset investigation

Two official public repositories were read successfully:

- [OpenAddresses](https://github.com/openaddresses/openaddresses): source catalogs for address/parcel/building/street data. Its BSD repository license is not a blanket license for each upstream dataset; inspect the applicable source terms. It is not a national ownership/contact or sale-history replacement.
- [Microsoft US Building Footprints](https://github.com/microsoft/USBuildingFootprints): building footprints under the ODbL described in the README. These are building shapes, not owner identities, parcel titles or transactions.

Broader GitHub repository search was blocked by the execution environment's network proxy. No licensed, reusable copy of Regrid, ReportAll, ATTOM, Reonomy or ZoomInfo's paid databases was verified. A public GitHub upload would still need an explicit redistribution license and credible provenance before reuse. No third-party dumps were imported.

A public transmission-line ArcGIS layer also returned metadata during this review, with a September 2023 last-edit date. Its publisher/reuse context and companion substation service were not established, so it was not presented as a current official utility API or connected to feasibility screening.

## Relative to paid products

| Capability | Radar after this build | Paid-data gap |
|---|---|---|
| Parcel search and satellite research | NJ + selected FL, chat results, mapped outlines where available | Regrid/ReportAll advertise broad national coverage; Radar has county-specific gaps |
| Published assessment names | Account-free queries where connected source exposes them | Normalized nationwide coverage and vendor update pipelines |
| LLC research and related holdings | Dated same-name observations and manual evidence dossiers | Reonomy-style entity/principal resolution, verified relationships and broader holdings |
| Business contact research | User-entered cited contacts only | Licensed contact enrichment such as ZoomInfo; no verified contact dataset bundled |
| Sales, mortgages, ownership changes | Supplied local comps; private workspace can import permitted history | ATTOM/Reonomy-style national transaction, mortgage and change coverage |
| Listings, asking prices and renewals | No feed; missing criteria explicitly flagged | A separately licensed/current listing or lease dataset is required; do not assume any named parcel vendor includes every field |
| Environmental/utility screening | Flood/wetland adapters, source links and manual observations | No utility capacity, zoning entitlement, service availability or buildability determination |
| Field work | Satellite property cards, route links, photos, notes, printable packs | User supplies observations and verifies imagery/boundaries |

Vendor fields, access rights and prices require confirmation with the vendor; earlier trial/quota figures have not been reverified. TruePeopleSearch is not connected and does not resolve a parcel to a verified business owner.

## Remaining legacy-pilot differences

Not restored: the pilot's Excel/SharePoint/OneDrive folder reader and scoped outbox automation, its exact Power BI output contracts, approval-gated acquisition scoring, entity-resolution review workflows, or compatibility with its old private dossier/workbook formats. Current comps import accepts CSV, not XLSX; current research queue CSV is a new contact-free export, not a claim of Power BI schema compatibility. No complete transaction master was established by the recovery files.

Browser-local data is tied to this site origin/browser and can be lost when site data is cleared. Field-trip backups merge; saved-research and ownership exports should be retained privately. Multi-user sync/SSO and a persistent hosted backend remain separate work. No live paid coverage is implied.

## Validation

Automated unit checks cover official ID matching, SQL escaping, county collisions, redacted-name behavior, source ambiguity/errors, comp types/units, spreadsheet-safe CSV exports and assembly geometry. Browser checks exercise owner lookup/dossier persistence/export, batch research, assembly export, screening notes, valid/invalid comp imports, map expansion, mobile overflow, existing field packs and hosted-summary privacy. Public-source live checks and mocked UI checks are recorded separately; neither establishes all-county production reliability.


## October 27 mobile and Lehigh Valley follow-up

Fixed preset/county/market synchronization, direct coverage/error messages, and archival labels on old chat result groups after a new search. Search moves above the map on mobile without duplicating its form or losing chat state. Mobile navigation links cover search, map, companies, research tools, field trips and sources. Visible button heights are checked at 390px viewport width; browser microphone permission was not requested automatically.

PA is now selectable with Lehigh/Allentown and Northampton/Easton presets. County endpoint references came from the [OpenAddresses Lehigh catalog](https://raw.githubusercontent.com/openaddresses/openaddresses/master/sources/us/pa/lehigh.json) and [Northampton catalog](https://raw.githubusercontent.com/openaddresses/openaddresses/master/sources/us/pa/northampton.json). Catalogs identify candidate official endpoints; they do not validate current service schemas, uptime, CORS or redistribution terms. The Lehigh reference is cataloged as an address source; its geometry must verify as parcel polygons at runtime before the adapter proceeds.

The PA adapters request live metadata before every scan and require polygon geometry, the cataloged parcel ID, source object ID, and ordered pagination. Only recognized public address, acreage, assessment-class and year fields are projected. Numeric class codes need source-provided coded-value meanings; zoning or acreage is not inferred. Missing acreage blocks acreage-filtered searches; missing classification blocks Industrial/Multifamily/Vacant searches and directs the user to All assessment types. Large searches retain the source-count safety cap. PA owner enrichment is not connected. GPS does not automatically infer PA counties; use a county preset or geocoded city/address.

Both county hosts returned proxy tunnel HTTP 403 from this execution environment, including an escalated read-only attempt. **No live PA parcel search or current schema has been verified.** Schema and end-to-end adapter behavior passed synthetic tests for both counties, unavailable services, missing class fields and unsupported PA counties. Production availability requires live validation from a browser/network able to reach those services. Source failures produce an explanation and never substitute a guessed NJ/FL location. Existing field-trip storage is retained unchanged.
