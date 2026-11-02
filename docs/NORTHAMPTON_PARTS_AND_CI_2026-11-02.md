# Northampton boundary pieces and map-focus regression — November 2, 2026

The live review reported repeated CAMA IDs with consistent acreage/address and
separate boundary pieces, plus a failing GitHub publish assertion requiring zoom
16. These are distinct problems; prior local passes did not verify GitHub CI.

## Boundary retrieval

Northampton now requests `CAMA_ID ASC,OBJECTID ASC` (using the schema-verified OID
field) with row offsets. It does not seek past an entire CAMA ID, which could skip
its remaining boundary rows at a page boundary. OIDs need not appear in returned
GeoJSON for the server to use them as ordering tie-breakers.

Rows sharing a CAMA ID are consolidated only when projected attributes agree,
excluding the OID. Distinct polygon pieces are unioned; exact duplicate geometries
are ignored. Whole-parcel acreage and financial fields are retained once, never
added across rows. Conflicting attributes stop the county retrieval explicitly.
Published parcel numbers remain separate from the CAMA grouping key.

Source counts and safety caps still apply to raw boundary rows. Accepted results
are unique grouped parcel records. The final status distinguishes source rows
from grouped parcels. Repeated entire pages, count drift and source failures
remain partial rather than claiming complete inventory. Geometry/acreage quality
and year filters are recomputed from the combined shapes.

Address identification also consolidates same-CAMA pieces before deciding whether
a point has an ambiguous parcel match. Exact ownership lookups can consolidate
consistent repeated owner/mailing rows; conflicting names or truncated responses
remain unavailable. No owner, sale availability or legal parcel status is inferred.

## Map focus and CI

Removed fixed minimum zoom assertions from both smoke and reliability tests.
The shared assertion verifies that the complete parcel boundary fits the map,
the map center lies in its bounding box, and zoom matches the existing
geometry-based fit with padding and maximum zoom 19 (or zoom 17 for points).
It also verifies synchronous focus. This preserves large-site visibility instead
of forcing a crop to satisfy a test. Production zoom behavior is unchanged.

The new multipart browser fixture has 320 boundary rows, 318 grouped county
parcels, a split crossing the 50-row page boundary, an exact duplicate, a missing
returned OID and consistent duplicate ownership rows. It verifies 317 county
neighbors after excluding the selected anchor, plus NJ results. Conflicting
acreage and ignored offsets still fail visibly. This uses synthetic data, not
independent live county verification.

Both GitHub QA and publishing workflows include the new regression suite.
GitHub Actions API access returned 403 from this environment, so remote workflow
status and the reported historical failures could not be independently inspected.
Local validation must not be described as a confirmed green GitHub workflow.
Live county and Pages acceptance still require an independent live check.

## Local validation

246 unit/API tests passed on Node 24.19.0. All 13 browser suites passed locally,
including the new multipart suite (12 checks) and expanded reliability suite
(11 checks). The latter explicitly fits a large parcel below zoom 16 at both
390px and 1280px, preventing a return to the incorrect fixed minimum. The multipart
suite also checks that a temporary acreage/geometry warning clears when a small
first piece is completed by its remaining boundary area. Build, YAML, staged
whitespace and secret/held-file checks passed. This is not a remote CI verdict.
