# Florida OZ 2.0 eligibility (FloridaCommerce) and NJ parcel-count reliability — Nov 3, 2026

## Florida: official state eligibility, not nominations

Radar now reads FloridaCommerce's own OZ 2.0 eligibility layers, linked from the
[FloridaCommerce Opportunity Zones Program page](https://www.floridajobs.org/rural/opportunity-zones-program)
through its "High Impact Opportunity Zone Candidate Tracts" map:

| Layer | Designation | Tracts (Nov 3, 2026) |
|---|---|---|
| `oppzones_ustreasury_met` | Meets Criteria | 1,367 |
| `oppzones_ustreasury_NotMet` | Does not Meets Criteria | 3,709 |

- **Chat:** for Florida results, OZ questions report how many parcels are in tracts that meet / do not meet the criteria, plus independently checked 2018 OZ 1.0 overlap. Every answer states that no official Florida nomination list is connected and no new-round federal certification is verified by this check. No tax sunset is inferred from map membership.
- **Automatic observations:** Florida scans check both eligibility layers and the separate OZ 1.0 source automatically; an OZ chat question is not required.
- **Cards, Deal Nav, field packs:** each parcel shows its tract, the published poverty rate and family income vs. area income, and the meets/does-not-meet result. Eligibility is never worded as nomination.
- **Map:** new "OZ 2 FL eligible" toggle draws the Meets layer for Florida only.
- **Refused data:** unrecognized designations, non-Florida GEOIDs and repeated tracts stop the check; outages show "unavailable", never zero eligibility.
- **Not read:** the public-recommendations layer, which carries contact fields.
- **Dated evidence:** `assets/data/fl-oz-eligibility.json` contains 5,076 public aggregate tract records, checked November 3, 2026, with an 89-day validity window. Live boundary intersections must reconcile with this snapshot; expired evidence cannot produce an eligibility conclusion.
- **Weekly guard:** the `florida-eligibility` job in `refresh-oz-nominations.yml` runs `scripts/check-fl-oz-eligibility.py` and fails if counts, schema or designations change, a tract appears in both layers, or the reviewed anchor tract changes. `scripts/build-fl-oz-eligibility.py` renews the snapshot when facts change or expiry is within 30 days; unchanged recent checks do not create timestamp-only commits. The workflow publishes changed evidence and checks out current main after the NJ refresh to avoid conflicting writes. Example anchor: 7777 Southern Blvd (tract 12099007833) is NotMet (poverty 12.3%, family income $81,309 vs. $89,212) and a 2018 OZ 1.0 tract.

When Florida publishes its nomination list or Treasury certifies the new zones, connect that as a separate, reviewed source; this eligibility data must not be relabeled.

## NJ parcel search: longer count budget and one automatic retry

Live timing showed NJGIN's spatial count is the slow step (3–12 s cold, occasionally longer). Pages return in about 3 s. The old budget abandoned the count at 12 s and restarted it up to three times (~38 s to failure), discarding the server's work. Counts now wait up to 30 s with one retry, and the status line tells the user the source is slow after 8 s. NJ feature requests use smaller 75-record batches with a 12-second budget and one retry. Timeouts, network failures and transient HTTP errors are retried once; invalid requests and caller cancellation are not. No tiled-query strategy was added. `tests/nj-slow-count-browser.py` delays a first count 14 seconds to exercise the longer budget, then injects an actual transport timeout and verifies that a second search succeeds on its single automatic retry. Permanent outages can still fail honestly.
