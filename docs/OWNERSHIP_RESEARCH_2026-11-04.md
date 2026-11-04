# Selected-property ownership research and Claude PR review

PR #8 was already merged. This change incorporates PR #9's chat outcome handling, phrase regressions and fullscreen map controls, while replacing its scan-wide owner collection with selected-property research. Recovered historical names are not silently promoted to current owners.

## What is available

Select a commercial, industrial or vacant business target to see exact parcel references, dated assessment observations, published tax-bill mailing recipients and official registry/deed research links. NJ condo qualifiers remain part of the identifier. Source metadata determines which fields can be requested; a missing, protected or conflicting owner response is never filled with a guessed name. Assessment names are observations, not title certification. Residential selections do not trigger this additional research.

The research panel can save a cited organization locally and export the selected evidence. An optional EPA check reports nearby facility references separately: an operator is not a property owner or verified decision maker. Shared mailing addresses describe an association only; they do not establish common ownership or propagate names between parcels. Historic deed grantees remain sale parties, not current owners. County reference links requiring independent access verification are labeled accordingly; search links are not evidence.

Owner, recipient, operator, contact and analyst-note fields are excluded from hosted summary prompts. New local imports and raw exports stay local until explicitly reviewed for publication. At the user’s request, the previously approved public map’s 1,490 owner-name observations are also published as dedicated CSV/JSON files, preserving 439 FL and 1,051 PA historical records and their mailing fields. No NJ names exist in that imported source. Exact-matching imported references appear separately on property cards and in the research workspace; they do not overwrite live source names. Internal notes and deal terms remain held out. The Pages entry password remains a courtesy screen and is not secure hosting for private research.

## Local NJ evidence pipeline

Run from the repository root, for example:

```sh
python3 scripts/build_nj_owner_lookup.py --counties Hudson Middlesex --classes 4A 4B --min-acres 5 --max-records 500
python3 scripts/build_nj_owner_lookup.py --pams-ids 0909_21_2.03 --classes 4A --min-acres 0 --max-records 1
python3 scripts/build_nj_owner_lookup.py --csv-only --local-csv-dir raw_modiv_csvs --csv-source-url https://example.gov/published-tax-record --source-date 2026-10-01
```

The example CSV citation must be replaced with the actual source. CSV rows need an exact PAMS_PIN (including any qualifier) or municipality/block/lot/qualifier components. Supported name fields include OWNER_NAME, OWN_NAME and GRANTEE; GRANTEE is retained as a historical sale party. Supply SOURCE_URL and SOURCE_DATE per row where possible. Only organization-style evidence is imported into this business research dataset. Unknown dates remain unknown.

Outputs default to `.radar/owner-research/nj-ownership-evidence.json`, ignored by Git. The script refuses repository outputs outside `.radar`, including public assets and dist. Count/ID and batch reconciliation run before atomic replacement; failures preserve previous output. A bounded partial export is labeled partial. Optional `--resolve-epa` stores facility references separately and does not fill owner gaps. Load the JSON using the ownership workspace's local evidence picker; nothing uploads to Pages.

## Nomination controls

The banner and municipality chips derive counts, county coverage and source-flagged rural rows from the current dated NJ evidence. The present bundle contains 130 tracts, 20 counties, 60 municipality/county pairs and 13 source-flagged rural tracts. Missing, invalid or expired evidence does not receive fallback counts or nominated labels. Rural tract flags do not establish county eligibility or a federal timetable. Municipality and rural controls scope the tract inventory; existing meaningful parcel-overlap and certification caveats remain in force.

## Independent checks and remaining limits

During implementation, live NJGIN and Florida DOR metadata were accessible and their actual field names were checked. The exact live NJ sample `0909_21_2.03` reconciled one record and published mailing fields, but its owner name was blank. This is not a resolved owner. NJ schema uses PCL_MUN/PCLBLOCK/PCLLOT/PCLQCODE rather than the guessed proposal fields.

Monmouth, Morris, Hudson-reference and Middlesex-reference tax portals, EPA endpoints and ArcGIS service discovery were blocked by this execution environment's network proxy. Mocked EPA tests verify response handling and separation from ownership; they do not establish live EPA availability. A Lehigh PIN/PARNUM primary-record join is implemented and tested as a prepared adapter, but remains disconnected until a concrete matching official service and browser access are independently verified. No invented source URL or automatic owner/contact coverage claim is included.

The automated browser suite covers selected-only queries, qualifier preservation, protected records, local citations, historical sale parties, shared-address separation, exports, prompt privacy, dynamic nomination filters and mobile map expansion. Real device voice testing remains a separate manual check.

Rebuild the public owner-file extracts from the approved archive with `node scripts/build-imported-owner-files.mjs`. This script does not read the internal master or `.radar` files. Commit both generated files under `assets/data/imported-owner-records.*` to publish the reviewed observations.
