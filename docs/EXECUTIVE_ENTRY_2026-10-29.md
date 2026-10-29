# Executive entry and industrial brief — October 29, 2026

## Entry screen

The public app opens on a black password screen. The requested `WP123` password reveals it; entry is remembered for the tab's session, and **Lock screen** returns to the entry form without deleting trips, dossiers or notes. Storage failures are handled. The map is resized after unlocking.

This is a **courtesy screen**, not authentication or confidentiality protection. GitHub Pages serves public HTML, scripts, the password comparison and assets. Do not put private company data behind it. Real access control requires a host that checks authentication before serving the app; that hosting is not configured by this change.

## Top industrial scan

Choose West Palm Beach, Secaucus, North Bergen or Edison; choose minimum acreage and radius. The form runs the existing public search and builds separate warehouse/distribution and outdoor-storage research shortlists. The top brief explains acreage, assessment type, proximity, published physical facts, ownership observations, constraints and diligence gaps. It uses no assumed company underwriting criteria, price target, government offer, zoning approval or seller willingness. Site checks can be run from the top form and update the brief with progress messages. On phones, a large disclosure opens the controls to preserve room for search and the map.

## NJ ownership correction

Removed blanket claims that owner names cannot be obtained in NJ or are universally redacted under Daniel's Law. The connected NJGIN service has an `OWNER_NAME` field. Explicit, exact-parcel lookups now read it, verify the parcel identity and show published values with dates. Blank and protected values remain unavailable, not inferred names. Organization-style observations can be saved to the existing company workspace; individual observations remain selected-record information rather than a company directory entry. Ownership never establishes title, beneficial control or permission to sell.

Live checks of five industrial records each in Secaucus, North Bergen and Edison returned **15 blank OWNER_NAME values**. Therefore this change does **not** supply universal NJ owner coverage or claim a new county ownership API. County tax/deed records may publish names absent from this feed. The detail card links to official records research and includes published block/lot identifiers where available. County-by-county automatic owner enrichment remains unconnected where no verified public adapter is available. No protected record is bypassed, and no guessed name is substituted.

## Live-review fixes

- The OSM converter and MIT license are tracked at `assets/osmtogeojson.js` and `assets/OSMTOGEOJSON-LICENSE.txt`. The same relative path is copied to the Pages artifact. Build checks verify every local script reference and execute the converter in an isolated VM to ensure the global exists. This also supports branch-root publishing layouts.
- Northampton requests use ordered, explicit ID batches of **50**, keeping GET URLs below the reported county limit while preserving identity/count reconciliation. The regression fixture uses 320 ten-digit IDs and verifies seven batches and URLs below 2,000 characters.
- Shared NJ/FL sale normalization excludes $1-or-less nominal sales, missing/invalid dates and the January 1, 1979 placeholder. NJ YYMMDD values preserve leading zeroes and become real calendar dates: `210818` → Aug 18, 2021; `030806` → Aug 6, 2003. Impossible dates are rejected. PA's separate normalization remains in place. These are recorded transaction facts, not current asking prices or verified comparable sales.

## Validation and remaining acceptance

214 unit/API checks and nine browser suites cover the entry form, blocked storage, mobile widths, published/blank/protected NJ names, the industrial brief, actual served converter, short county requests and existing search/field-trip/OZ/KML behavior. Fixture suites enter through the actual password form, without disabling the gate in application code.

Northampton, Overpass and the deployed Pages URL cannot be independently validated through this environment's network restrictions. After deployment, hard-refresh and confirm the converter request is HTTP 200, Easton PA and NJ source completion, and live footprint measurements. A physical iPhone voice test is still a manual acceptance item. The prior five-acre minimum and map-reference distance rule remain visible; no assumption is made that a nearby town boundary establishes a nearby five-acre parcel.
