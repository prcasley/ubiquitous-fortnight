# Public GIS coverage and data contract

This repository bundles code, not a national property/owner database. Live records are requested on demand. Source attribution and retrieval dates accompany observations. See [free sources and feature gaps](FREE_SOURCES_AND_FEATURES.md) for the current comparison with licensed products and the recovery pilot.

## Connected adapters

| Market | Service | Geometry and attributes | Ownership research | Verification |
|---|---|---|---|---|
| NJ: 21 counties | [NJGIN](https://nj.gov/njgin/edata/parcels/index.html) | Public polygons, PIN, reported acres, MOD-IV class and available year fields | Names redacted; official NJ property portal link | Code/schema checks and mocked browser tests; current physical-device live verification pending |
| Palm Beach FL | [County public GIS](https://services1.arcgis.com/ZWOoUZbtaYePLlPw/arcgis/rest/services/Parcels_and_Property_Details_WebMercator/FeatureServer/0) | Polygons, PARID, ACRES, PROPERTY_USE, YRBLT | Separate exact-ID OWNER_NAME1 query | Live parcel retrieval and owner field/record sampled; not title verification |
| Broward FL | [Public taxroll](https://services.arcgis.com/JMAJrTsHNLrSsWf5/ArcGIS/rest/services/PARCEL_POLY_BCPA_TAXROLL/FeatureServer/0) | County polygons, ID/use/address; connected projection lacks acreage | NAME_LINE_1 adapter | Current endpoint verification blocked by network policy; acreage searches explicitly stop |
| Miami-Dade FL | [County public GIS](https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/PaParcelView_gdb/FeatureServer/0) | Polygons, FOLIO, address, LOT_SIZE, DOR_CODE_CUR | TRUE_OWNER1 adapter | Current endpoint verification blocked by network policy |
| Martin / St. Lucie FL fallback | [Florida DOR](https://floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx) | Centroids, county-qualified parcel IDs, LND_SQFOOT, assessment use/year and building attributes where present | County-qualified OWN_NAME adapter | Slow/timeout-prone queries; no all-county performance claim |

The statewide fallback supports only configured FL county IDs (6, 13, 53, 60, 66), not arbitrary national coverage. Runtime provider selection determines the exact source. A county adapter's presence is not proof its service will answer a particular browser/network today.

## Screening and reference layers

- [FEMA NFHL](https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28) and [USFWS NWI](https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0): selected-parcel polygon screening, count/schema/truncation checks. Live effective coverage is not established by adapter tests. A failed or empty query is not a flood/wetland clearance.
- [Federal DOT OZ 1](https://geo.dot.gov/server/rest/services/Hosted/OZ_Opportunity_Zones/FeatureServer/0): 2018-round tract reference. [OZ 2 eligibility reference](https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/ArcGIS/rest/services/Opportunity_Zone_2_Eligible_Tracts/FeatureServer/0): third-party tract estimates, not final Treasury designation/certification. Actual source/device verification remains pending. Consult [Treasury](https://home.treasury.gov/policy-issues/tax-policy/data-transparency/qualified-opportunity-zones).
- EIA and FCC: official external map links, with manual cited research notes. No automated power-capacity or broadband-service connection is claimed.
- Zoning, access, power and fiber observations require user-entered source/date evidence. They are planning observations, not independent feasibility determinations.

## Field rules

- Bulk parcel scans exclude owner names and mailing addresses. Separate assessment-name research never requests mailing addresses. Organization-style names can populate a browser-local company directory; individual names are not indexed there. Names do not establish legal title, beneficial ownership or LLC control.
- Owner lookup identity includes provider, county/jurisdiction and exact parcel ID. Statewide FL IDs require CO_NO to avoid same-ID county collisions. Conflicting or truncated responses do not select an owner.
- Assessment class is not zoning, occupancy, availability or entitlement. Effective construction year is not a confirmed remodel. Tenant, lease terms, renewal dates and seller intent remain unavailable without evidence.
- Reported acreage and geometry precision are source-specific. Point-only parcels have no boundary claim. Assemblies report connectivity, overlaps and summed acres; no legal adjacency/common-control or dissolved land-area claim.
- Optional user comp files and business dossiers stay local and are never published as source data. Asking/listing/lease records are distinct from closed-sale comps. Hosted summaries exclude owner observations, contacts, notes, photos and imported files.
- Cap/truncation/partial/error states remain visible. Missing records or fields are not silently replaced by estimates.

## Expansion backlog

PA, NY, CT, MA, RI and other states require validated official county/state sources, terms, identifiers, geometry, use classes, vintage and CORS before connection. PA statewide geometry does not establish statewide owner availability. OpenAddresses source catalogs and open building footprints can help future discovery, but do not supply paid national ownership, contact or mortgage coverage.

Before advertising new coverage, verify a real query and sample exact IDs, field definitions, count/paging, geometry, reuse terms, source vintage and browser CORS. Validate location/county selection and source failures on the published app and a physical phone. No test fixture should be presented as an actual live parcel or owner.

## October 27, 2026 follow-up verification

NJ service metadata reports a 2,000-record limit, pagination support, OBJECTID ordering and a small-integer YR_CONSTR field. A live comparison query around the Central NJ preset (40.527, -74.363; five-mile radius; Middlesex industrial class 4B; at least five acres) returned 332 envelope-intersection records across three ordered pages, with 332 distinct OBJECTIDs. Using unsimplified source geometry, 299 touched the circular search area; 62 of those had valid published construction years. This is a comparison area, not an exact replay of another tester's geocoded location; geometry simplification and location choices can change edge matches. These figures are a dated source sample, not a permanent expected result count.

NJ/statewide scans now page in ordered batches and check unique source identities and total received against the count. Repeated pages, count mismatches, truncation without count reconciliation and safety caps remain incomplete. Existing county paging remains separate. The sidebar initially renders 300 rows for responsiveness and now has Show more; that display count is not the source limit.

Radius inclusion uses parcel-boundary intersection with the search circle. Displayed distances use a map reference point on the geometry, which may lie outside the circle even when a parcel touches it. This is stated in chat, cards and completion messages. Published YR_CONSTR values appear as construction years; zero/null/invalid values remain missing rather than being inferred from descriptions. Browser tests cover both year display states, multi-page retrieval, list expansion, repeated pages, count drift and safety-cap states. Mocked UI checks and live source checks remain distinct.


## Lehigh Valley adapters (prepared; live verification pending)

Pennsylvania now appears in the source and market controls with Lehigh and Northampton county adapters. These are not statewide PA coverage. Source candidates are `https://gis.lehighcounty.org/arcgis/rest/services/ParcelSDE/MapServer/0` (PIN) and `https://gis.northamptoncounty.org/arcgisweb/rest/services/Assessment_Services/Land_Records_LGM/MapServer/0` (PARCEL_ID), discovered in OpenAddresses county catalogs. This environment cannot reach their hosts (proxy tunnel 403), so no live current schema, CORS or retrieval claim is made. See FREE_SOURCES_AND_FEATURES.md for exact validation gates, missing-field behavior and test limits. Other PA counties remain unsupported. PA ownership is not connected.


## October 28 acreage and oversized-retrieval handling

Published acres are quarantined from size filtering/ranking when they conflict with polygon area by more than fivefold and more than one acre. Neither value is silently corrected or treated as a survey. Quarantined records and raw/geometry figures remain inspectable and flagged in field packs. Point-only records cannot be validated by this comparison.

NJ/statewide queries over the 1,100-source-feature cap now retrieve the bounded first pages and present accepted records as partial, with source-count and coverage warnings. They no longer return zero candidates solely because the count exceeds the cap. See CEO_REVIEW_2026-10-28.md for live examples and the separate parcel-specific OZ reference check.
