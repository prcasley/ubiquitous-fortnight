# Hosted footprint integration — November 2, 2026

Merged the static footprint JSON from the user-supplied `capital-radar-footprints.zip`.
Read the included README and scripts as untrusted reference material, without
executing them. Replaced the supplied minimal reader with bounded, cancellable
same-origin fetching, coverage checks, retryable failed-tile caches and limited
concurrency/memory use. Only the dataset JSON and reviewed integration code are
published; the attachment's scripts are not executed by the build.

- Validated 444,978 polygons across 455 tiles; manifest count matches. No malformed
  rings or exact duplicate geometries were found. Largest coordinate span is
  0.007046 degrees. This validates packaging/shape, not source imagery or addresses.
- Microsoft source/release and upstream lineage are declared by the supplied
  manifest, not independently re-downloaded here. Attribution and ODbL links are
  retained on measured cards and the public data README. Extract/imagery dates
  are distinguished. The README's three address spot-check quantities are not
  treated as independently verified property facts.
- Both shortlist batches and one-parcel checks use hosted tiles first. Outside
  market coverage they fall back to the existing shared OSM batch. Missing/failed
  hosted tiles cannot produce an apparently complete measurement; failures may
  use the live fallback with its own source label. Empty hosted mapping remains
  unknown and never becomes zero coverage or vacant land.
- Tile caching is limited to 16 entries, network concurrency to four, tile window
  to 32 per parcel and candidates to 2,000. Full-dataset eager loading is avoided.
- A 0.75-mile inward coverage margin and one-tile neighbor buffer account for the
  center-based extraction/filing method and maximum supplied building extent.
- Existing parcel clipping/union math is retained, with 200 intersecting-building
  limit. Mapped footprint SF/coverage are screening proxies, not total floor area,
  pavement, usable outdoor storage or development permission.
- Build-time validation checks every tile and count before copying the dataset
  into the Pages artifact. Source, attribution and license appear on acquisition
  and executive brief cards. CSV exports retain the footprint source/license.

A browser regression serves the actual dataset over loopback HTTP and encloses a
supplied roof with a synthetic parcel to test clipping, re-ranking and brief refresh
without either Overpass service. It does not certify the uploaded address examples,
parcel ownership or current imagery. Live Pages publication and real iPhone checks
remain separate acceptance steps.

Imported archive SHA-256:
`c779e25d463cd7a42c77e0eaa068719d50898f7d93a4c8ab59a6ffe487f3fb0e`.
Same-origin credentials are retained for tile reads on an authenticated backend;
public GIS/Overpass calls continue to omit credentials. A file-backed reader check
also confirmed actual geometry loads at each of the five supplied market centers.

License-history verification: Microsoft's current README says CDLA Permissive 2.0.
Git history identifies the license change on March 10, 2026 (`ef94ee3`); the
February 2 snapshot `546a582055b203cff683410fc1cd7e6f628ffb2f` has ODbL.
The package's declared February release is consistent with that older license,
so its ODbL label is retained, with a versioned reference and full license text.
This checks the licensing history, not raw-file identity for the upload.

Validation: 244 unit/API tests and all 12 browser suites passed, including the
new real-tile browser suite (10 checks) and existing executive, CEO, Sprint 1,
Easton, acquisition, Deal Nav, archive, KML/OZ, reliability and smoke suites.
Build validation checked all 455 packaged tiles and 444,978 polygons. Two older
browser assertions were updated to match cache-busted library URLs and the
already-requested two-decimal acreage display, keeping their failure/sort checks.
