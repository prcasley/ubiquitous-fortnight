# Easton follow-up — October 30, 2026

The live review confirmed cross-border retrieval, historical recorded sales and faster
site checks. It still reported incomplete Northampton retrieval, unavailable footprints,
unconnected chat ownership lookup and disruptive selected-parcel navigation.

## Changes

- PA scans now seek by the published parcel key (`PARCEL_ID` for Northampton,
  `PIN` for Lehigh), ordered ascending, in 50-record pages. Later pages retain
  the spatial/acreage/type predicates and add `key > last-key`. They no longer
  rely on object-ID snapshots or offsets. Existing duplicate-key, source-count,
  safety-cap and partial-result checks remain. A source that ignores the seek
  predicate still fails visibly rather than claiming completeness.
- The previous build already deduplicated Northampton by `PARCEL_ID`; simply
  replacing OBJECTID again would not change its behavior. The new browser
  fixture omits OIDs and ignores object-ID batches to exercise the request path.
  This reproduces the reported failure mode, not independent confirmation of
  the live county server's internal cause.
- Chat and Deal Nav now share an exact-parcel Northampton ownership adapter.
  On request it reads published owner lines and mailing-address variants,
  retains source/time and refuses conflicting/mismatched records. Optional
  field variants are handled with a one-record `outFields=*` lookup, not bulk
  ownership scanning. Individual names/mail are not added to assistant summaries
  or public exports. Organization observations retain the existing local dossier
  behavior; no title, beneficial-owner or contact inference is added.
- PA municipality and use labels are read from field/subtype coded-value domains.
  `MUNI` is supported. Unmapped numeric codes are explicitly unverified, not
  guessed as industrial. Commercial descriptions display as Commercial.
  Empty trailing street punctuation is removed.
- Deal Nav's open button focuses satellite imagery and scrolls to the map.
  Navigation selections suppress auto-nearby scanning and the competing mobile
  detail scroll, preserving the current search/shortlist. A one-card display is
  labeled Selected parcel rather than an incomplete one-result search.
- The parcel-detail caveat now correctly distinguishes historical recorded sales
  from current asking prices and verified comparables.

## Remaining limits

No Microsoft building-footprint dataset is included in this change. The current
Microsoft index was found in its public GitHub README, but requests to
`bfppub.blob.core.windows.net` and the legacy footprint download host were denied
by this environment's network proxy (403). The existing OSM batch/mirror fallback
can still fail. Missing footprints remain unavailable, never zero coverage.

Live county GIS metadata/codebooks are also blocked here. Domain translation is
implemented and tested; a complete Northampton MUNI/LUC lookup for services that
publish no domains is still pending authoritative codebook verification. Do not
claim all live PA parcels now have town/use labels.

A hard-refresh live Easton test is still required to verify county behavior,
accepted counts and Pages publication. County counts are source features before
local radius/geometry acceptance, not a promise of 992 industrial opportunities.
Historical sale observations are not automatically verified comparable sales.

## Validation

- 233 Node unit/API tests passed.
- Eight browser suites passed: smoke, Easton (21 checks), Deal Nav (17),
  acquisition (27), reliability (9), executive (57), CEO (83), Sprint 1 (173).
- Easton includes 320 synthetic county records across seven key-seek pages,
  omitted object IDs, ignored object-ID batches, real duplicate-key rejection,
  cross-border preservation on source failures, chat ownership lookup and
  390px navigation retaining acquisition results.
- Build, staged whitespace, secret-value and held-file checks passed.
- Browser fixtures establish application behavior, not live source accuracy,
  current ownership/title, sale comparability or successful Pages publication.
