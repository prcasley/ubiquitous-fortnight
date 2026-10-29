# Local recovered-reference review

The user subsequently authorized publishing the restored parcel facts and map layers. The reviewed allowlist bundle is now included in the standard Pages build. Rankings and the other held review categories remain local and unpublished.

## Included

The allowlisted local bundle contains 1,608 historical parcel observations across eight source groups: Palm Beach/Mangonia 51 (24 Mangonia Park, 27 West Palm Beach/unincorporated PBC), NJ 116, Lake Worth 10, surrounding context 6, tri-county 323, Lake Worth inventory 42, additional Florida 9 and Lehigh Valley 1,051. They are not asserted to be distinct physical parcels or currently available properties.

Historical fields include parcel IDs, locations, owners/mailing observations where supplied, acreage and land sq ft, building/year/use fields, assessments, recorded sales with nominal/placeholder exclusions, zoning fields, derived coverage/value ratios and historical OZ reference flags. Their original file date remains September 28, 2026; they are not freshly retrieved or independently verified.

The bundle also has 24 municipality boundary overlays and 194 historical OZ eligibility references. Recovered rings are drawn as outlines without assuming legal boundaries or hole topology. The 51 Palm Beach/Mangonia records have source pins rather than recovered parcel polygons; the other 1,557 observations include source rings.

## Held out

Target rankings, priority/order, strategy, seller-readiness inferences, draft environmental/redevelopment conclusions, lease/availability references, demo comps, the 40 Hilton concept-plan image/design, free-text workflow notes, raw nested evidence and internal source-document paths are not copied into the app. Full original records and the review package remain outside the repository at `/workspace/radar-recovery-review`.

## Local use

Prepare the reviewed fact bundle from the extraction:

```
python3 scripts/prepare-recovered-reference.py /path/to/woodmont-recovered-complete.json
npm run preview:local
```

The preview serves only `dist/` on loopback port 8090. The existing courtesy password is `WP123`. Recovered data appears in its own **Recovered map data** section, accessible from navigation or the top scan controls. It does not enter live results, acquisition rankings, saved company records or hosted-assistant payloads. Changing archive filters or fitting its map does not move the explicit live search anchor.

`npm run build` includes `assets/data/recovered-reference.json`, the reviewed parcel-fact/reference-layer bundle. `npm run build:local` can override it with the ignored `.radar/recovered-reference.json` for local review. Full source archives, rankings and the other held categories are not included in either standard build or published dataset.

For a self-contained local HTML preview:

```
npm run build:local
node scripts/build-local-reference.mjs /path/to/Capital_Radar_Local_Reference_Preview.html
```

The result embeds code, styles, library licenses and the reviewed reference bundle. It needs no hosting for the embedded facts; live GIS, imagery and external Maps links still need internet. This environment blocks file-scheme browser navigation, so the generated file was tested over loopback HTTP rather than by double-clicking it.

## Validation

221 unit/API checks and ten browser suites passed. The synthetic archive browser suite checks allowlisting, historical labels, owner observations, map/source isolation and phone/desktop layout. The actual standalone preview was additionally exercised with all 1,608 source observations, 24 Mangonia records, all 1,051 Lehigh rows, reference layers and 390/1280-pixel widths. The publication build includes the allowlisted reference bundle and excludes full source archives and held analysis. Browser fixtures isolate test data from the published dataset.
