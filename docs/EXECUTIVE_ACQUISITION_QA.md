# Executive acquisition workflow QA — October 27, 2026

## Intended use

An executive is narrowing industrial acquisition candidates in Florida and New Jersey against a January 1 planning target. The app must preserve that shortlist while the user sorts, browses, checks sources, researches owners and prepares a field visit. A dated source observation is not a verified opportunity to acquire, an approved closing timeline or a tax qualification.

**January 1 is the user's planning target in these tests.** No official OZ2 list publication date, designation, eligibility for a specific purchase or tax treatment was verified. Source URLs and current dated Treasury/IRS guidance must establish those facts separately. The third-party OZ2 map is an eligibility estimate, not a final designation or parcel-level tax determination.

## Automated coverage

`npm test` now runs 71 unit/API checks, including 28 executive-language scenarios and explicit partial-summary tests. `python3 tests/browser-smoke.py` retains the existing search, source paging, county identity, ownership, mobile, research, photos, field-pack and hosted-summary regressions. `python3 tests/executive-browser.py` adds 55 workflow checks. Both browser suites use shared synthetic fixtures and isolated browser storage; no real executive shortlist, owner names, contacts, photos or API key is used. The hosted-summary fixture simulates inference without calling a paid endpoint. Voice tests use a test double and never request a real microphone.

| Executive action / failure | Expected and tested behavior |
|---|---|
| Ask for industrial parcels in NJ or FL with exact/minimum/range/about acreage | Preserve operators, property type, state and radius; approximate acreage remains a labeled ±10% range |
| Ask for the largest existing sites | Sort retrieved acreage descending in sidebar and chat; retain the identities, source, search ID, location and filters; issue no new GIS/geocoder query |
| Request a negative size/radius or inverted acreage range | Explain invalid input and retain the current shortlist |
| Ask about $5 million / $750k budgets | Recognize the amount; purchase budget matching stays unverified because transaction/listing prices are not connected |
| Ask about closing before January 1, future OZ2 qualification, expiring leases or sale comps | Explain evidence gaps; preserve current results instead of inventing a match or clearing the shortlist |
| Double-click to zoom while identifying | Zoom without an identify request, shortlist replacement or a changed search anchor |
| Inspect a residential parcel outside the industrial shortlist | Show independent details with its own provenance; preserve the original results, filters, count and complete/partial state |
| Inspect a parcel already in the shortlist | Show the fresh inspection while retaining the dated source-search observation |
| Run a preset after inspection, map panning or zoom | Restore the same explicit location/filter request and deterministic fixture identities |
| Receive an identify response after a new search | Ignore the stale response; do not reopen old details or change the new results |
| Deliberately choose Set search center | Update the next query anchor; existing results retain the area under which they were retrieved until a new scan |
| Research an individual/unclassified assessment name | Show a visible explanation; do not index it into the company directory |
| Research an NJ owner | State that the connected layer redacts names; do not infer an owner |
| Add an inspected property to a field trip | Keep its observation date and identified status without replacing the shortlist |
| Prepare a mixed FL/NJ acquisition pack | Retain both stops, source provenance and unresolved budget/deadline/OZ criteria |
| Load OZ1 and OZ2 together | Show distinct blue/brown legend swatches with names, status and non-designation caveats |
| Turn on Identify or zoom out | Preserve requested OZ checkboxes; explicitly show unavailable/zoom-closer state when data cannot be loaded |
| Zoom back in | Automatically refresh requested overlays for the new viewport |
| OZ service outage, cap, truncation or unknown eligibility indicator | Show unavailable/requested status and no tract-status conclusion |
| Turn off an overlay while its response is pending | Abort/discard it; do not let the late response draw the layer again |
| Request source context or sort after partial retrieval | Explain/rank the retrieved subset with a partial warning, not a claim of an exhaustive market search |
| Request a hosted explanation of partial data | Send explicit `scanComplete:false` and `scanStatus:partial`; retain the warning in model context and the server/client response |
| Send failed/cancelled/loading/identify-only status for hosted summary | Reject it; those are not accepted as completed or explicitly partial retrievals |
| Browser storage fills during field-trip work | Say the new stop exists in this tab only; still allow exporting it in a backup |
| Speech transcription or device startup fails | Do not start a guessed search; release the button and leave typed input/results available |

Additional existing tests cover owner-ID SQL escaping and exact matching, same-ID county collisions, missing acreage, source truncation, polygon holes, point-only screening limits, explicit count caps, photo/backup restoration, imported-comp units and CSV escaping, authentication, private-field exclusion and provider-neutral failure messages.

## Running and reviewing

```sh
npm ci
npm run build
npm test
python3 tests/browser-smoke.py
python3 tests/executive-browser.py
```

Python checks require `requirements-dev.txt` and Chromium. The public QA workflow runs both browser suites. They are sequential to keep browser resource use predictable.

No production readiness or live county/overlay uptime claim follows from fixture success. Remaining live checks include a real NJ and FL acquisition session on the published site, source projection/vintage and CORS, physical-phone taps/GPS/voice, official OZ files and publication timing, utility/zoning/availability evidence and a configured hosted backend. PA source hosts remain blocked from this environment as documented separately. No field trip or ownership dossier in the user's browser was cleared or migrated by this change.
