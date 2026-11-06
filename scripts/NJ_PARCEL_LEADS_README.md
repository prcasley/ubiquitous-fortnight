# NJ parcel lead research

`nj_parcel_leads.py` adapts the supplied Python scan and tests into a standard-library-only local research tool. It needs Python 3.10+ and internet access; no model, provider account or API key is required.

Run against the exact qualified parcel IDs from a prior call sheet:

```sh
python3 scripts/nj_parcel_leads.py \
  --csv .radar/oz-research/carteret-sayreville-full-context.csv \
  --min-acres 1.5 --full-mailing \
  --out .radar/oz-research/nj-parcel-leads-103.csv
```

Or scan the whole municipalities, independently of nomination tract boundaries:

```sh
python3 scripts/nj_parcel_leads.py \
  --muni 1201,1219 --classes 4B,4A,1 --min-acres 1.5 --full-mailing \
  --out .radar/oz-research/nj-parcel-leads-municipalities.csv
```

The CSV includes source dates and links, match methods, heuristic linkage confidence, dated program references, a primary organization-style regulatory lead, assessment observations if actually published, and mailing-address associations. Street lines are omitted unless `--full-mailing` is specified. Shared recipients preserve suites, street types, city/state and ZIP. Input CSV columns carry an `INPUT_` prefix so earlier assertions are not presented as fresh observations.

`BEST_LEAD` is a research reference, **not verified ownership, a current operator, a phone/email contact or sale availability**. Its confidence refers to the match method, not a probability that someone owns the parcel. Recent means a recently dated program with its own active flag and no end date; it does not independently establish present business activity. A newer closed program does not refresh an unrelated older active program. Individual-like names and public infrastructure references are not chosen as primary company leads. Assessment values are not tax basis.

Each site is assigned to at most one target. Unique interior geometry takes precedence. Street-address fallback requires the same municipality, standardizes suffixes rather than deleting them, and rejects a contradictory far-away geocode. Overlapping/shared-edge and ambiguous nearby matches remain unassigned. Nearby-only references are labeled low and are not primary leads. Polygon holes and all source rings are respected.

Every source schema and OID is read from metadata. Retrieval reconciles counts, explicit ID lists, batches of at most 100, and an ending count. Duplicate/foreign/truncated responses fail instead of being presented as complete. Only explicit fields are requested; sensitive metadata fields such as SSN are never queried for values. Protected assessment records suppress their mailing recipients. Source queries are bounded to 20,000 rows per request scope, input CSVs to 2,000 parcel IDs, and municipality scans to ten explicit codes; narrow the scan if a bound is exceeded.

A `.coverage.json` sidecar records all reconciled source counts and the scan scope. CSV rows omitted by acreage/class filters stay explicitly marked as not returned for that scope when starting from parcel IDs. Municipality results are **not** limited to OZ tracts. Neither mode determines parcel nomination, certification, industrial zoning or acquisition suitability.

CSV output is local under `.radar/` (or an explicit location outside the repository), never an owner-index upload. Existing published owner files cannot be overwritten. Spreadsheet formula prefixes are escaped. Source requests fail before replacement of an existing CSV; completed output is atomically renamed. No result is sent to the hosted assistant or automatically published to Pages.

Validation:

```sh
python3 -m unittest discover -s tests -p test_nj_parcel_leads.py
```

November 6, 2026 live checks before the final metadata-label additions:

| Scope | Parcels | Assigned site references | Parcels with a primary regulatory lead |
| --- | ---: | ---: | ---: |
| Exact 103 supplied candidate IDs | 103 | 170 | 54 |
| Entire Carteret + Sayreville, business classes, 1.5+ acres | 296 | 461 | 113 |

These are regulatory research leads, not verified owners. Original supplied test coverage was retained, with its suite-merging expectation corrected and additional ambiguity, recency, source-pagination and privacy tests added.

Recorded transfers now format valid dates and separate low-consideration amounts (at most $100) from price references. Placeholder/future dates remain unknown; no inheritance, debt maturity or seller intent is inferred. The original recorded consideration stays in its own source field for deed review.
