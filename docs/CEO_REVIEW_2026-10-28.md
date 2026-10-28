# CEO wording and data-quality acceptance review — October 28, 2026

## Readiness decision

The earlier guided-demo recommendation was premature. A passing controlled test suite did not establish that ordinary CEO wording worked on a fresh page. This update implements the reported reproductions and adds fresh-versus-loaded-history tests. The deployed Pages site still needs a fresh independent acceptance pass before the CEO handoff. Deployment and physical-device behavior cannot be certified from this environment.

## Corrections

- A search no longer requires Find/Show. Topic-plus-location fragments, both `in` and `near`, short city/state fragments, trailing question marks and state-first wording initiate searches. Bare acreage in a shorthand fragment means at least that size and is announced as such; explicit `exactly` remains exact.
- A size-only follow-up preserves property type, county, location, radius and unresolved criteria. Changing to All property types requires an explicit request. New full location requests create property cards rather than entering the old five-item stock-answer path.
- Published acreage is compared with the mapped polygon area. When the figures differ by more than fivefold and more than one acre, the record is quarantined from size matching and rankings. Raw acreage, estimated polygon area and the warning remain available for inspection and field packs. No corrected acreage is silently substituted. Centroid-only sources cannot support this geometry comparison; agreement does not establish a survey. This check applies to newly retrieved records; older saved observations should be refreshed at source before decisions. Existing saved files are not silently rewritten.
- NJ/statewide oversized searches now retrieve a bounded first 1,100 source features and show accepted candidates as partial. They do not return an empty list solely because the source count exceeded the cap. Rankings are confined to that retrieved subset. Existing county adapters may use a smaller cap.
- Who owns the largest one targets the actual largest accepted parcel and queries its official assessment record. FL chat cards offer a direct lookup and show dated organization observations after lookup; previously saved local observations can be restored as dated research. A selected single record may display its published name without indexing an unclassified/individual name into the company directory. NJ redaction remains a real source gap, with official research links; no names are inferred or harvested around it.
- Which of these qualify for OZ2 now checks retrieved parcel geometries against the third-party eligibility-reference service and lists the intersecting candidates with tract IDs and check dates. Absence is not a finding of ineligibility. An intersection does not establish full parcel inclusion, final designation, closing feasibility or tax qualification. The reference result can accompany a field pack. Failures/caps/unknown indicators produce no qualification claim.

## Live source findings

The exact reported LOWDEN & LEWISTON record was queried read-only from NJGIN: CALC_ACRE is 44,900, its mapped polygon is approximately 1.031 acres, and its assessment class is 15C. It should not enter an industrial 4B refinement in the first place. The acreage guard also handles corrupt size fields in otherwise matching classes. This is evidence of conflicting source values, not permission to infer a legal corrected area.

A local Chromium session used the actual application with an HTTP relay to live public geocoder and parcel services. Basemap/imagery requests were blocked for that focused data check. This verifies query/data behavior in the local build, not native browser CORS or the published Pages deployment. Sources may change after this dated sample.

| Exact live request | Accepted results | Status / evidence |
|---|---:|---|
| industrial parcels over 5 acres in Edison NJ | 312 | Complete; strict greater-than-five filter; all industrial |
| Edison NJ industrial 5 acres | 324 | Complete; shorthand minimum-five filter; all industrial |
| warehouses near Edison, NJ | 886 | Complete retrieval; five acreage conflicts quarantined; all accepted records industrial |
| industrial land over 10 acres in West Palm Beach, FL | 8 | Complete; all industrial |
| Show only parcels over 20 acres after Edison industrial search | 58 | Complete; industrial, center/county/radius retained |
| Show me warehouses in Secaucus NJ | 988 | Partial bounded retrieval; 36 acreage conflicts quarantined; accepted records industrial |

A separate live Palm Beach follow-up on the eight-record cohort displayed the largest property's published assessment name. Its organization classification was unverified, so no company-directory inference was made. The live OZ2 reference check covered all eight, with four reference intersections; none was treated as tax-qualified. Separate five-parcel source samples produced one NJ reference intersection and two FL reference intersections. Those sample results are not market-wide counts or final designations.

## Automated checks and reproducibility

- 94 unit/API checks, including the exact reported fragments, refinement intent, anomalous acreage, explicit broadening and reference geometry/count/schema errors.
- Existing browser regression suite: paging, private-field exclusions, mobile layout, saved research, photos, packs and hosted-summary routes.
- 55 executive workflow checks: shortlist preservation, map/zoom state, stale requests, source context, owner privacy, mixed-state packs, speech and storage failures.
- 54 additional CEO-reproduction checks: eight phrases from truly fresh browser contexts, repetitions after loaded searches, filter-preserving narrowing, bad-acreage exclusion/pack warnings, oversized Secaucus retrieval, targeted owners, cached-name visibility and parcel-specific OZ answers.

These deterministic suites use synthetic data; fixtures now use realistic parcel areas so area checks are not bypassed or weakened to accommodate tiny placeholder geometry. No user trip, 22-owner research set, private portfolio or live API credential is in the fixtures. All three browser suites run sequentially in public QA.

```sh
npm run build
npm test
python3 tests/browser-smoke.py
python3 tests/executive-browser.py
python3 tests/ceo-browser.py
```

Optional live, read-only checks (not run automatically in CI):

```sh
RADAR_LIVE_SMOKE=1 python3 tests/live-ceo-smoke.py
RADAR_LIVE_SMOKE=1 RADAR_LIVE_PHRASE='industrial land over 10 acres in West Palm Beach, FL' RADAR_LIVE_EXTRA=1 python3 tests/live-ceo-smoke.py
```

The optional check writes aggregate evidence to `/tmp/capital-radar-live-ceo-check.json`. It does not export owner names, parcel records or credentials. Browser microphone access is not part of this check.

Before the CEO handoff, confirm the latest Pages deployment, hard-refresh and repeat these exact phrases on the published app, including a real phone. Confirm that flagged acreage stays out of rankings and that owner/OZ answers identify specific records with source dates. NJ owner names, listings/renewals/prices, final OZ2 qualification and the official release timetable remain separate data/evidence gaps. January 1 is a planning target here, not a verified publication or qualification deadline. Hosted model summaries still need a running authenticated backend.
