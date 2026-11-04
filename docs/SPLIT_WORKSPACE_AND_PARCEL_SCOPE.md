# Three-mode workspace and parcel coverage

The map now shares the screen with one research drawer. The three keyboard-accessible modes are Scan & Layers, Deal Nav & Assembly, and Ownership & Field Pack. They reuse the existing sections and map instance; changing mode does not clear the current search, selected parcel, overlays, shortlists or trip. On phones, the map remains above the mode buttons and independently scrolling drawer. Fullscreen map and Escape remain available. Direct section links activate the corresponding mode.

Existing browser workflow suites navigate the real mode buttons before interacting with moved panels. The separate workspace suite disables that convenience helper and tests tab clicks, arrow/Home keys, map continuity, mobile overflow and drawer scrolling directly.

## Upstream filtering and inventory pagination

NJ live scans already apply PROP_CLASS and CALC_ACRE criteria in ArcGIS `where` before paging. The NJ nominated-tract inventory now does the same for its chosen class/acreage scope. It defaults to industrial/commercial/vacant (classes 4B/4A/1); other explicit class choices remain available. It reconciles the source count with `returnIdsOnly`, fetches bounded explicit-ID POST batches, validates identities and boundaries, and rechecks the count. An individual tract is not limited by ArcGIS's 2,000-feature response limit. Per-run safety caps still produce partial coverage labels. Changing upstream criteria starts a new coverage scope. Previously retrieved records remain available if a retry fails, but reports from an older filter scope are labeled and never counted complete for the new request.

## Florida polygons

Palm Beach, Broward and Miami-Dade already use county polygon sources. The newly supplied statewide FL_Parcels endpoint is a candidate, not independently confirmed coverage. The app probes its layer metadata when a centroid fallback would otherwise be used. Only a polygon schema with the required exact parcel/county identifiers and canonical assessment fields can replace that fallback. A missing, blocked or incompatible candidate preserves an explicit centroid limitation, not invented parcel boundaries. Polygon queries are not rejected solely because of a map display-scale setting.

The implementation environment returns proxy 403 for the supplied services5 endpoint, so live statewide polygon availability and additional named county endpoints have not been established here. No claim that Hillsborough, Duval, Pinellas, Lee or Orange is fully connected is made.

## NJ ownership: actual coverage gap

The imported public archive contains 1,490 named ownership observations (439 FL, 1,051 PA) and no NJ owner names. The legacy internal property master also has no populated NJ legal-owner entities. NJGIN metadata is accessible, but an exact live NJ sample publishes mailing fields with an empty owner field. County tax portals, NJ Treasury downloads and Rutgers were blocked by this environment's network proxy; those failures do not establish that the records are unavailable to users elsewhere.

Selected-parcel county references, exact qualified PAMS joins, dated citations and the NJ CSV pipeline are available. A populated official county/MOD-IV owner dataset is still required to fill those NJ names. Facility operators, shared tax mailings, historical buyers and company affiliation are not substituted for ownership.

The Ownership mode accepts cited NJ CSVs directly in the browser (PAMS_PIN with qualifier, OWNER_NAME/OWN_NAME, SOURCE_URL and optional SOURCE_DATE/AS_OF). Defaults for a citation URL and observation date can be entered when the export omits those columns. Source-quoted company names appear as dated imported assessment observations, not inferred current ownership; grantees remain transaction parties. The Middlesex official assessment hub is linked for per-parcel research and Excel exports. No private or protected names are reconstructed.

The user-supplied NJ nomination CSV, GeoJSON and KML contain 130 tracts, and the GeoJSON's exact GEOID set and counties match the connected evidence. Download copies and a checksum/provenance manifest are under `assets/data/nj-nomination-downloads/`, linked from Scan & Layers. They do not replace the scheduled official evidence refresh or establish ownership or federal certification.
