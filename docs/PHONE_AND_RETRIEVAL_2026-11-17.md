# Phone layout and retrieval fixes — November 17, 2026

Scope: layout under 600px, tract inventory retrieval, carrier contact lookup, load weight, OZ 2.0 wording.
The welcome code and contact vault are unchanged in this pass.

## Phone layout (`assets/radar-phone.css`, loaded last)

| Measure (Chrome emulation) | Before | After |
|---|---|---|
| Header height, 320–430px | 159px | 105px |
| Search box top, 390×844 | 778px | 617px |
| Search box top, 320×568 | 695px (off screen) | 450px |
| Page scroll behind the app | 64px | 0 |
| Status line contrast | about 1.3:1 | white on dark panel |

- A real phone breakpoint (600px) instead of one 900px rule for every small screen.
- Header is two rows: brand, mode and lock; then tabs beside the text-size buttons.
- Tab strip and map toolbar fade at the right edge to show they scroll.
- Search box comes first in the panel; map layers move under it.
- Checkboxes and radios are 22px inside 44px rows. Visible type stays at 15px or larger.
- Safe-area padding for notched phones.

## Retrieval

- **Tract inventory** (`radar-oz-inventory-core.js`): bounded retry on timeouts, dropped connections and 429/5xx;
  the parcel schema is read once per session instead of once per tract; explicit ID batches run three at a time
  with the same in-order identity and count checks.
- **Carrier lookup** (`radar-contact-verifier.js`): the town and house number are filtered at the source, so one
  small request replaces up to ten 1,000-row pages per property.
- **Town names**: `ORANGE CITY TWP` now matches filings under `ORANGE`; `GLOUCESTER CITY` and `JERSEY CITY CITY`
  keep their real names; different municipality types never match through a shared base (`UNION TWP` is not
  `UNION CITY`). Names used by more than one NJ municipality are flagged on the contact.
- A town name with no carrier filings is reported as not checked, never as "no carriers".
  `scripts/usdot_site_context.py` records `no-records-under-town-name` for the same case.

## Load and wording

- The 2.5 MB reference file revalidates instead of downloading on every load; the OZ evidence file is requested once
  at start-up instead of three times.
- Labels and notices now say the 130 NJ tracts are Treasury-designated (release SB0682, effective January 1, 2027).

## Not changed here

- Published NJ research data was not regenerated; Orange and other towns recorded with zero carriers need a rerun
  of `scripts/usdot_site_context.py` on a network that reaches data.transportation.gov.
- Live services and physical phones were not tested from the build environment.
- Scripts still load in sequence; bundling them is a separate change.
