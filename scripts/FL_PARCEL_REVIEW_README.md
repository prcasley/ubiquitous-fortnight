# Florida parcel evidence review

Run a fresh, count-reconciled Palm Beach County scan:

```sh
python3 scripts/fl_parcel_review.py --live-pbc \
  --min-acres 1 --out .radar/oz-research/wpb-mangonia-evidence-review.csv
```

This source scope is named WEST PALM BEACH / MANGONIA PARK records, `CONDO=NO`, 1+ published acres and industrial/warehouse/manufacturing/storage use labels. It is not an 8-mile search or the 803-row file mentioned in the pasted report. That underlying CSV was not attached. The live scope reported 443 records when initially counted on November 6, 2026; the ending count must reconcile before output is replaced.

To review an existing local file, including environmental-history text:

```sh
python3 scripts/fl_parcel_review.py --csv path/to/wpb-mangonia-leads.csv \
  --out .radar/oz-research/wpb-mangonia-import-review.csv
```

Python 3.10+ and the standard library are sufficient. The tool reuses the source metadata/count/ID batching and request pacing in `nj_parcel_leads.py`. Parcel IDs remain strings, with safe left-padding of 15–17 digit PCNs; scientific notation cannot be reconstructed safely and is rejected. Confidential records suppress names and mailing addresses.

The output is a due-diligence queue, not an acquisition-propensity model:

- Unknown dates remain unknown. Time since a recorded transfer is not the current owner's holding period, depreciation history or loan maturity.
- Low-consideration transfers are flagged for deed review and excluded from price references. They do not establish inheritance, restructuring, distress or willingness to sell.
- Older building years invite condition review. They do not establish depreciation exhaustion or an easy improvement test.
- Imported text mentioning closed/expired permits invites environmental/source review. It does not establish vacancy, business closure, current permit status or absence of contamination. The fresh parcel-only scan has no connected FDEP query, so regulatory status remains unestablished.
- Every owner category stays in the queue. Institutional/government names are not declared “never sellers.” Shared tax mailing is not common control or a portfolio.
- Sunbiz links open the entity-name search portal, not a verified exact annual report or a decision-maker record. Care-of recipients and registered agents require role verification. No personal skip tracing, credentials, account setup or outbound contact occurs.

Unsupported scores and owner/operator claims supplied in an input remain clearly `INPUT_` columns. They are not promoted to current findings. Source dates and explicit availability/relationship/maturity unknowns accompany the review flags. The queue counts verification flags, not sale probability. Local outputs are kept under `.radar/` or outside the repository; existing public data/owner indexes cannot be overwritten.

The same source check exposed a live browser adapter mismatch: Palm Beach publishes mailing fields `PADDR1/2/3`, `CITYNAME`, `STATE`, `ZIP1/2` and `CONFID_FLG`. The selected-parcel mailing adapter now uses those verified fields, retains compatibility with older metadata aliases and suppresses protected records.

November 6 live result: 443 reconciled source rows became 441 unique parcels (389 West Palm Beach, 52 Mangonia Park). Two repeated parcel IDs had conflicting fields withheld and flagged; both source rows remain accounted for. All 441 have published assessment names and mailing recipients in that run; 397 organization-style names receive a registry-search route. Source observations are not verified title. The underlying 803-row report file remains unprovided.
