# Carrier rematch, mailing clusters and county owner lookups — November 17, 2026

Three scripts. Outputs go to `.radar/rematch/` (gitignored). No contact or owner data is added to the public site.

```sh
python3 scripts/nj_pull_rematch_inputs.py
python3 scripts/nj_carrier_rematch.py --parcels .radar/rematch/parcels.json --carriers .radar/rematch/carriers.json --out .radar/rematch/out
python3 scripts/nj_county_owner_lookup.py --parcels .radar/rematch/parcels.json --out .radar/rematch/out/county-owners.json
```

## Evidence roles (none is a deed owner)

| Role | Meaning |
|---|---|
| On-site carrier | Active federal carrier filing whose physical address is the parcel's address in the same municipality |
| Mailing-HQ carrier | Active filing whose physical or mailing address equals the parcel's tax-bill mailing address (street + ZIP5) |
| County assessment owner | Name on the county tax list for the exact block, lot and qualifier, with the list's "data as of" date |

## Results of the November 17 run (1,949 inventory parcels, 103 tracts)

| Measure | Result |
|---|---|
| Parcels returned by the NJ parcel service | 1,949 of 1,949 |
| Published carrier matches that were inactive filings | 122 of 328 |
| Active on-site carrier matches | 211 parcels |
| Mailing-HQ carrier matches (address not shared by more than 5 carriers) | 308 parcels, 293 of them with no on-site match |
| Parcels with either carrier link | 504, in 75 tracts |
| County assessment owner found | 365 of 520 parcels in the seven covered counties |
| Parcels whose published acreage is more than 3x off the mapped area | 169 |
| Parcels whose mapped area is under 2 acres | 246 |
| Sum of the published acreage field vs mapped area | 787,598 vs 18,842 acres |

## Things to know

- `CALC_ACRE` in the parcel service holds square feet or other units for some municipalities (Trenton, Orange and
  others). Rank and filter on mapped area (`GEOM_ACRES`), not on that field.
- Inactive carrier filings are excluded. They describe businesses that have stopped filing, not current contacts.
- A mailing address used by more than five carriers is flagged as a shared office and not attributed to one firm.
- County links are pre-filled only for Bergen, Burlington, Cumberland, Gloucester, Hudson, Salem and Union, whose own
  Board of Taxation pages link to the search. Other counties get the board page plus the block and lot to type in.
- The county search stops answering after a few hundred requests in a short period. The lookup script waits two
  seconds between requests, stops on the first empty page and resumes on the next run.
- The Middlesex `msnj.us/ctb/12` link in `radar-ownership-research-core.js` returned 404 on this date.

## Follow-up the same day

- **Acreage.** `node scripts/apply-mapped-acreage.mjs` is now the final publication step. It measures each parcel polygon,
  uses mapped area when the published figure is more than 25% away, and removes lots under 2 effective acres. Run it
  after `nj_enrichment_pipeline.py --publish`; `tests/mapped-acreage.test.mjs` fails if it was skipped.
  Result: 1,949 records to 1,749, 150 kept records corrected, 787,598 "acres" in the published field to 18,849 mapped.
- **Inactive carriers.** A carrier whose federal filing is inactive is shown as "Inactive carrier filing · potential
  transitional site" with its last filing date. It has no phone, no email and no call button, and quick picks list
  active filings only.
- **County links.** The app links straight to the county tax-list record for the exact block and lot in Bergen,
  Burlington, Cumberland, Gloucester, Hudson, Salem and Union. The Middlesex and Cape May `msnj.us` links returned 404
  and were removed; Middlesex keeps the county's own assessment search page.
- **County owners.** 512 of 520 parcels in the seven counties now have an assessment owner name.
- **Vault records.** `scripts/nj_build_vault_records.py` assembles the private contact file with an evidence role on
  every record. Cards show that role and the county assessment owner line when a vault record carries them.
