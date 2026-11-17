# NJ tract enrichment pipeline

This is a data-only pipeline. It does not modify the five-tab layout, CSS, welcome gate, contact vault, hosted assistant or UI strings.

## Current coverage and scope

Main already contained a scan of all 130 supplied tract boundaries, not just two tracts: 1,939 unique class 1/4A/4B parcels of 2+ acres plus 10 earlier, smaller Carteret/Sayreville records. The new pipeline preserves those 1,949 records and refreshes the remaining 128 tracts, prioritizing Kearny, Paulsboro, Mount Olive, Elizabeth, Hillside and Bayonne. The two earlier source tracts are `34023007103` and `34023980000`; `--all` includes them in enrichment too.

Parcel-to-tract association is a geometry intersection for research. It is not a claim of whole-parcel inclusion or tax qualification. Every source observation retains its own timestamp. A dataset's assembly time is not a recheck of every federal, filing or historical source.

Default parcel criteria are class `1`, `4A`, `4B`, acreage `>=2`. They are applied in ArcGIS `where` before ID discovery. `returnIdsOnly`, 100-ID POST batches, unique identities, geometry validation and before/after source counts prevent transfer-limit truncation. Each tract gets an atomic checkpoint. A bounded per-tract limit produces an explicit partial report; it never claims a complete scan.

## Commands

```sh
# Inspect the 130-tract ledger, with exactly 128 selected and the requested markets first.
python3 scripts/nj_enrichment_pipeline.py --plan

# Fetch the remaining tract polygons and mailing fields together, with resumable per-tract files.
node scripts/nj-enrichment-scan.mjs --remaining --out .radar/nj-enrichment/scans

# Enrich/merge every selected parcel; reuse fresh source observations, retry incomplete ones.
python3 scripts/nj_enrichment_pipeline.py --scan-dir .radar/nj-enrichment/scans

# Review local full.json/full.csv, coverage and business-filing-queue.json, then publish data.
python3 scripts/nj_enrichment_pipeline.py --scan-dir .radar/nj-enrichment/scans --publish

# Force a source refresh; the filing limit is explicit and remaining companies stay pending.
python3 scripts/nj_enrichment_pipeline.py --refresh --max-filings-per-run 100

# Include both earlier tracts in an enrichment run.
python3 scripts/nj_enrichment_pipeline.py --all

# Deliberately widen acreage, e.g. the Bayonne tract's smaller business parcels.
node scripts/nj-enrichment-scan.mjs --tract 34017010900 --min-acres 0 --out .radar/nj-enrichment/bayonne-small
python3 scripts/nj_enrichment_pipeline.py --scan-dir .radar/nj-enrichment/bayonne-small
```

There is no first-10 or first-500 enrichment sample. Resume checkpoints verify exact PAMS_PIN, facts, boundary and tract references; source changes invalidate the cached input. Newer source observations are preserved. A failed refresh stores `lastAttempt` separately and never clears a good older observation or renews its `checkedAt`. Provider-wide proxy denials are attempted once, not once per property. Pending/failed registry searches are not counted as resolved filings.

## Evidence roles

Each record keeps the existing loader-compatible nested contexts and adds an explicit `evidence` array:

| Role | Source and relationship |
| --- | --- |
| `assessed_owner` | Only a name actually returned in NJGIN's `OWNER_NAME`, attached by exact qualified PAMS_PIN. Protected/redacted values stay suppressed. |
| `tax_mailing_recipient` | `ST_ADDRESS`, with separate `CITY_STATE`/`ZIP_CODE`; not inferred owner identity or headquarters. `UNKNOWN` and `00000` placeholders are not recipients. |
| `njdep_regulatory_site` | NJDEP Layer 143; point-in-parcel, same-address or nearby relationship and confidence retained. |
| `njdep_program_interest` | Table 148, joined by exact SITE_ID; PI_ID, source active flag and source dates retained. Not title or confirmed current operations. |
| `usdot_carrier` | Carrier physical street/city/state association; mailing addresses never establish a site match. Shared municipal names require location review. |
| `usdot_carrier_officer` | Officer on that carrier's FMCSA filing, with USDOT number, company, carrier status and MCS-150 filing date. Not seller authority or parcel control. |
| `epa_facility_reference` | Existing dated EPA ECHO/FRS facility reference. Not current operation or ownership. |
| `business_filing_entity` | Exact-name NJ business registry entity, with entity number and official detail citation. The parcel relationship keeps the originating evidence role. |
| `state_registered_agent` | Agent explicitly named on that entity filing. Not inferred principal, owner or acquisition decision-maker. |
| `business_filing_contact` | Business phone/email explicitly shown in the cited filing; no guessed email domains or footer phone numbers. |

No regulatory name, carrier officer, registered agent or mailing recipient is copied into `assessmentOwnerObservation`. No owner/contact data is sent to a model. Full mailing associations preserve suite, city/state and ZIP and never establish common ownership.

The CSV retains legacy fields and adds `NJDEP_REGULATORY_SITE_NAMES`, carrier/officer/contact columns, filing candidate/status/entity/agent columns and role-specific dates/sources. `TAX_MAILING_RECIPIENT` is the street field; city/state and ZIP are separate columns. Unknown numeric/contact facts are not invented. Spreadsheet formula prefixes are escaped.

## Non-trucking warehouse / business filing step

A warehouse does not need a USDOT number. Company candidates come from its source assessment observation, parcel-linked NJDEP program interests or existing EPA facility references. Nearby-only low-confidence regulatory names are excluded from filing candidates. All candidates retain their original role and citation.

`scripts/nj_business_filings.py` reads the official anonymous NJ search form, retaining its hidden form tokens/cookies. It follows a unique exact-name result to an official detail page and requires independent entity-name and 10-digit entity-number fields before accepting a filing. Agent/contact fields must have explicit labels. Unknown forms, ambiguous names, CAPTCHA and blocked requests stop that provider step without guessing an endpoint, bypassing a challenge or claiming no company exists. Only a bounded number of unique companies are queried per run; completed results are cached so later runs advance the queue.

An official-copy import is also available when the registry cannot be read automatically:

```json
{
  "format": "RadarNJBusinessFilings",
  "version": 1,
  "records": [{
    "entityName": "EXAMPLE WAREHOUSE LLC",
    "entityId": "0000123456",
    "sourceURL": "https://www.njportal.com/DOR/BusinessNameSearch/Entity/0000123456",
    "observedAt": "2026-11-17",
    "reviewed": true,
    "registeredAgentName": "EXAMPLE AGENT",
    "sourceFields": {
      "entityName": "EXAMPLE WAREHOUSE LLC",
      "entityId": "0000123456",
      "registeredAgentName": "EXAMPLE AGENT"
    }
  }]
}
```

The example URL/number/name is synthetic, not a known live NJ record. Replace it with the actual official detail citation and fields from a reviewed filing. A search-portal URL alone is insufficient. Optional `businessPhone` / `businessEmail` must also match identically named `sourceFields`. Multiple entity numbers with the same normalized company name require disambiguation; related companies are not substituted.

```sh
python3 scripts/nj_enrichment_pipeline.py --filings .radar/reviewed-nj-filings.json --publish
```

Imported copies are labeled `user-reviewed-official-copy`; automatic detail reads are `official-page-read`. Neither authenticates property ownership or current operation. Import without live requests using `--offline`; observed filings, source roles and missing-field statuses still export.

## Public outputs and publication guards

- `assets/data/nj-parcel-research.json`: existing v2 manifest.
- `assets/data/nj-research/*.json`: existing municipality shards, now with role-separated enrichment; per-shard SHA-256 in manifest.
- `assets/data/nj-parcel-research.csv`: complete matching parcel rows and enrichment columns.
- `assets/data/nj-enrichment-coverage.json`: all 130 ledger rows, selected 128, source-specific coverage, role counts, actual missing fields and provider failures.
- `assets/data/nj-business-filing-queue.json`: unresolved corporate candidates, linked parcel IDs and official research route; explicitly not resolved contacts.
- `assets/data/nj-tract-coverage.json` / `.csv`: updated count summaries; legacy under-2-acre records remain in research but are not counted as 2+ acre parcels.

Every output is staged before swaps. Ordinary publication failures roll back the prior JSON/shards/CSV/coverage bundle. CSV and JSON identities must match exactly, with no duplicated PAMS_PIN. No private vault, historical owner index, UI/CSS asset or uploaded raw file is rewritten.

## November 17 verification

All 128 remaining tract queries completed with counts reconciled: 1,862 returned source rows, 1,846 unique parcels. Retaining the previously researched two-tract scope and ten smaller historical records leaves 1,949 records overall. Two formerly partial NJDEP checks now complete. Source dates for cached federal records remain their original dates.

Live priority counts at 2+ acres: Kearny 18; Paulsboro 26; Mount Olive 9; Elizabeth 306 17; Hillside 35. Elizabeth 304, Bayonne 109 and Bayonne 110 have zero at 2+ acres, but respectively 98, 119 and 105 class 1/4A/4B records with the acreage minimum removed. Zero is a filter result, not absence of property.

NJGIN and NJDEP were reachable. This environment's proxy denied USDOT, EPA and NJ registry requests. Existing 328 carrier associations and 386 carrier-officer observations were preserved with their source dates. No new registry agents were fabricated: 2,695 unique corporate candidates remain queued for a reachable source or reviewed official filing. NJGIN still supplied zero assessment-owner names; six records had placeholder mailing streets. The pipeline explicitly reports these gaps.

Tests cover over-500-row processing, all 128/130 scope choices, source-side predicates and explicit ID batching, failure retention, independent source dates, role separation, protected/missing data, multipart deduplication without acreage inflation, CSV/JSON identity checks, rollback, registry ambiguity/form guards, filing imports and resumable query budgets.
