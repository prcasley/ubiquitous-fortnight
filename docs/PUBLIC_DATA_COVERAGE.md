# Public GIS Coverage & Data Contract

This document describes sources and coverage in the public research application. It contains no private datasets, individual-owner directories, internal lead lists, transaction data, or private scoring.

## Connected today (code present; live browser verification pending)
| Market | Service | Map precision | Public source attributes | Owner policy | Status |
|---|---|---|---|---|---|
| New Jersey: 21 counties | [NJGIN statewide parcel composite](https://nj.gov/njgin/edata/parcels/index.html) | Parcel polygons from public GIS; not surveys | Parcel PIN, parcel area, MOD-IV class, published construction year when present, source update | No owner names projected | Adapter implemented; CORS/live query pending |
| Florida: Palm Beach (DOR 60), Martin (53), St. Lucie (66) | [Florida DOR assessment and parcel information](https://floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx) | Statewide source parcel centroids, not land boundaries | Parcel ID, assessment use code, reported lot SF/acreage, actual/effective year built and building area if published, assessment year | No owner names or mailing addresses requested | Adapter implemented; CORS/live query pending |
| OZ 1 reference | [Federal DOT public opportunity-zone polygon layer](https://geo.dot.gov/server/rest/services/Hosted/OZ_Opportunity_Zones/FeatureServer/0) | Census tract reference, not parcel map | 2018-round designated tract geometry and published GEOID | Not applicable | Reference overlay built; actual source response not device-tested |
| OZ 2 eligibility reference | [Nationwide third-party eligible-tracts map](https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/ArcGIS/rest/services/Opportunity_Zone_2_Eligible_Tracts/FeatureServer/0) | Census tract estimates, not certification | GEOID and third-party eligibility field | Not applicable | Reference overlay built; **not** Treasury certified |

The source-specific GIS and statutory definitions always control over names in this document. [Treasury's Qualified Opportunity Zones page](https://home.treasury.gov/policy-issues/tax-policy/data-transparency/qualified-opportunity-zones) provides official 2018/2027 files. OZ 2 eligibility or nomination is not final designation. Missing maps, a failed query, service truncation, or a zero-feature result on a secondary layer must not be interpreted as official negative eligibility.

## Expansion queue, not currently connected
1. **PA**: PASDA statewide parcel geometry and Lehigh/Northampton/Berks/Philadelphia county assessor services. Validate available parcel identifiers, acreage, source licenses and vintage; no assumption of statewide recorded owners.
2. **NY**: NYS GIS parcel services where available, counties (Long Island, Rockland, Westchester), and municipal/state building data. No claim of uniform statewide assessed ownership.
3. **CT / MA / RI**: state geospatial portals and town/municipal assessment exports (MassGIS Level 3 parcel research), with reuse and field validation.
4. **DE / MD / VA / DC / WV**: state and county cadastral services; verify assessor land-use classifications and parcel detail APIs.
5. **NC / SC / GA**: state GIS inventories and county assessors (e.g., NC OneMap, Fulton/DeKalb); validate current vintages.
6. **TX**: TNRIS and county appraisal-district services; do not use Harris County to imply coverage of Waco, McGregor or Lancaster.
7. **AL / MS / LA / AR / TN / KY**: state open-GIS and county assessor services; only connect after field/privacy tests.
8. **OH / MI / IN / IL / WI / MN / IA / MO / KS / NE / OK**: state geospatial portals, county tax assessors, local parcel IDs.
9. **CO / NM / AZ / UT / NV / CA / OR / WA / ID / MT / WY / ND / SD**: statewide parcel portals where available, otherwise county services.
10. **AK / HI / ME / NH / VT**: jurisdiction-specific parcel/tax services; special geometry and coverage checks.

A future source registry should include `state`, `county_fips`, `provider`, `source_url`, `copyright_reuse`, `fields`, `last_updated`, `ownership_policy`, `geometry_precision`, `CORS`, and `live_verified`. A source is not "connected" merely because a URL has been found.

## Attribute rules
- `yearBuilt`: actual assessor construction year when present.
- `effectiveYear`: published assessor **effective year built**, not automatically an actual remodel or renovation date.
- `remodelYear`: null until a verified permit/assessor field explicitly supports the assertion.
- `leaseTerm`, `leaseExpiration`, `tenant`: null, because statewide parcel and tax services do not establish these facts.
- `owner`: suppressed from the public version by default. Publishing a third-party or county-collected name requires separate legal/privacy/provenance review; public availability alone is insufficient.
- `parcelAssembly`: user-selected list with sum of recorded acres only; no inferred contiguity, common ownership or transactional availability.
- `landUse`: assessment class only, not entitlement, permitted zoning, active occupancy, redevelopment feasibility or property availability.
- No sale/lease comparison data, financial data, contact dossiers, or private candidate list is published.

## Validation before release
1. Confirm exact ArcGIS layer schema (year fields, county fields and response formats).
2. Run a real Palm Beach industrial query and a real NJ polygon query on a phone; capture actual returned count and IDs.
3. Validate response count vs returned features, 3-/4-digit Florida use codes, geometry, CORS, and capped-search warnings.
4. Verify county selection against actual geocoder-provided county when available; do not silently infer county from a nearby city.
5. Inspect network requests for names/contact/mail fields and any confidential endpoints.
6. Confirm the OZ reference layers expose the expected federal GEOIDs and eligibility flag schema. Never convert uncertain labels to official designation.
