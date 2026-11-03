# Address-centered parcel searches

Filtered searches retain a street address after “near”, “around”, “within N miles of” and “at”. Bare-address requests still identify a parcel without running an acquisition search. City and county searches retain their existing behavior.

An address match must have an ArcGIS score of at least 90 and a PointAddress, StreetAddress or Subaddress match type. Explicit state, source extent and connected county checks remain required. If no confident address candidate is returned, Radar can try the explicitly named city and states that the search is centered on the city rather than the address. A geocoder outage does not silently fall back.

After an address-centered scan, a spatial hit test identifies the unique public parcel polygon containing the geocoded point. A separate subject card and permanent map label retain the subject even when it fails the acreage, assessment-type or published-year filters. It is not inserted into accepted results or their counts. Ambiguous polygons and centroid-only sources do not establish a subject parcel. Geocoding and GIS containment do not establish title or surveyed boundaries.

The address match and center are retained for acreage follow-ups and search-history restoration. Subject markers survive selection of other results and clear when a different search starts.

Live API checks on November 3, 2026 returned score-100 PointAddress candidates and one containing public polygon for each example:

- 7777 Southern Blvd, West Palm Beach, FL: Palm Beach PCN `00424327050064201`; published 6.0525 acres, vacant industrial.
- 1 Harmon Plaza, Secaucus, NJ: NJGIN parcel `0909_21_2.03`; published 1.7 acres, class 4A. This subject does not meet an industrial-over-5-acre search.

`tests/address-search-browser.py` uses isolated synthetic fixtures to cover the four phrasings, separate subject counts, excluded subjects, follow-ups, low scores, city-only address candidates, state/county guards and city/county regressions. These fixture checks are distinct from the live API observations above and from deployment verification.
