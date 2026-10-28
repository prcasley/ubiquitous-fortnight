# Deal Nav, physical screening and map reliability — October 28, 2026

## Flood correction released first

Commit `22d17ca` fixes the credibility issue reported on Edison parcels. FEMA NFHL contains low/moderate-risk zones as well as high-risk zones. The previous code intersected all polygons, falsely reporting Zone X coverage as flood exposure. The corrected adapter counts SFHA A/V-family zones only; X/B/C do not contribute high-risk overlap. Shaded X remains outside SFHA but is not described as zero flood risk. D, unknown codes and contradictory SFHA flags remain undetermined. Mixed AE/X tests measure only AE. Source completeness, polygon holes, unions and centroid-only limitations remain enforced.

Older saved flood results lacking `classificationVersion: fema-sfha-av-v1` are marked outdated when displayed/exported; old percentages are not presented as high-risk exposure. Original saved files/notes are not erased or silently reclassified. Transient fetch/HTTP 408/429/5xx/timeouts retry once, while user cancellations do not retry. Persistent errors remain unknown and have an explicit retry action.

## Actual use-case proxies and ranking

NJ published land/improvement assessments, construction years and deed references are projected from the existing public MOD-IV layer; Palm Beach land/improvement market-assessment fields are also projected. Assessment values are not asking prices or appraisals.

Public USA Structures polygons supply **mapped ground/roof footprint area**, unioned and clipped to the parcel. This is not total building floor area, a building survey, pavement detection, physical vacancy, usable yard or net buildable land. No returned building is an unknown coverage result, not proof of an empty lot. Source imagery/production vintage can differ from the published construction year.

The NJ road-centerline adapter measures straight-line distance to published I-287, US Route 1 and NJ Turnpike mainline features within five miles; obvious Turnpike ramp labels are excluded. This is not distance to a legal interchange, truck-route permission or driving time. The named NJ adapter does not invent equivalent PA/FL road coverage.

The use lists now differ on connected facts:

- Warehouse/distribution: mapped footprint size, then published construction year.
- Outdoor storage: low mapped building coverage, land share of published assessment values, then measured named-corridor proximity. Low roof coverage is not a finding that the land is paved or permitted for storage.

Environmental reference priority precedes the physical proxies: completed flood/wetlands reference checks without a positive mapped constraint; incomplete/unchecked checks; then known mapped SFHA or wetlands overlap, with larger overlap lower. An unchecked parcel is explicitly not cleared. Positive mapping does not establish legal jurisdiction, unbuildability or an automatic no-buy decision. Zero-area boundary-only touches do not receive a hazard penalty. Old all-zone flood observations are not valid inputs to this ranking.

Acreage controls inherit the original source filter; card reasons retain strict “over 5” versus “at least 5.” Displayed acreage rounds to two decimal places and includes square feet. Source-filtered rows are never widened by the profile controls. Public checks cover the union of displayed candidates, at most ten unique parcels, rather than an ambiguously described “top 3 per list.” Deduplication is announced in progress text. Checks can be stopped and failed checks retried. Satellite thumbnails load eagerly with one bounded retry and a satellite link/fallback.

## Deal Nav: selected property, neighborhood and pricing facts

Deal Nav follows the selected source parcel. It includes:

- Reported acres and square feet; a five-mile all-assessment-type neighborhood search; and an optional automatic search after selection.
- A next-door query for mapped parcel boundaries within about 20 feet, with explicit GIS/ROW/legal-adjacency uncertainty and truncation labels. A five-mile radius alone is not described as adjacency.
- Published assessments, recorded sale amounts/dates where projected, deed book/page and official county recording links. Recorded sales are not current asking prices; sale conditions/arms-length status are unverified. Asking prices require an active listing or independently verified owner/broker inquiry. No comps valuation, private file or inferred owner/contact directory is created.
- Municipal website links where a municipality is recognized, plus a cited ordinance/setback/coverage/FAR worksheet. Municipal zoning districts, site-specific setbacks and project approvals are **not automatically connected**.

The calculator applies the largest user-entered front/rear/side setback uniformly to all parcel edges as a conservative schematic, computes GIS area inside that setback, applies any entered lot-coverage cap and separately shows the FAR floor-area ceiling. Inputs require an HTTPS source/date and all setbacks. Inputs clear on a different selected parcel. This is **not maximum developable acreage**: legal frontage/ROW, unequal yard interpretation, easements, wetlands, flood restrictions, access, parking, stormwater, height and municipal interpretation are not resolved/subtracted. A point-only address cannot run a polygon calculation.

### 40 Hilton St, Easton PA: actual read-only check

The public geocoder returned **40 Hilton St, Easton, Pennsylvania 18042**, score **100**, at approximately **40.670715, -75.222306**, Northampton County. The local browser test set the requested **five-mile** radius and Northampton source. County GIS metadata was blocked by this environment's outbound proxy (CONNECT 403), so **no live parcel/opportunity count was verified**. The app reports failed retrieval, not absence of opportunities. OpenAddresses' current public Northampton catalog still points to the configured parcel layer; catalog confirmation does not establish live uptime, CORS, schema or reuse terms.

## Local KML and executive map access

Local KML points, lines, polygons, holes and multi-geometries can be opened, shown/hidden, fit and removed without changing parcel results/search centers. Files remain in browser memory and are excluded from hosted summaries and the parcel database. Map services still receive ordinary requests for the viewed area. Five files, 5 MB per file, 2,000 geometries and 100,000 coordinates are bounded. XML entity declarations are rejected. Remote links, external images/styles, HTML and KMZ are not fetched/executed. Popups use text content. Each overlay has its own color/filename controls and auto-fits on opening; original files are unchanged.

OZ zooming no longer clears the current valid layer before fetching a replacement. At wider zooms, a bounded, paged, simplified **state overview** is loaded and cached; zooming closer restores detailed viewport geometry. Existing boundaries stay visible during a refresh or source error. Coverage labels distinguish state overview, detailed viewport and retained previous-area geometry. This is not a nationwide completeness claim, and overview boundaries are not parcel-level tax evidence. OZ toggles stay requested until explicitly turned off. NJ's actual third-party OZ2 service reported **516** reference tracts in the state count check; this is not a certified federal list.

Existing 17px text, A−/A+, touch targets and mobile layouts are retained. A fixed phone navigation strip provides Search / Map / Deal Nav so users need not find the top menu again after scrolling.

## OZ verification sources: leads versus evidence

The new evidence panel separates a third-party eligibility reference, verified official eligibility, a documented state nomination, and official federal certification. Nomination is not certification or a forecast of approval. Only exact 11-digit tract IDs, the correct round, dated current records and configured official sources can advance a stage. A third-party link—even several agreeing links—cannot certify a tract. Certification is still separate from whole-parcel inclusion, effective dates and project-specific tax qualification.

HUD, IRS, CDFI/Treasury source entry points; NJ/FL/PA agency discovery links; and the user-supplied OpportunityZones.com, Novogradac, OZ2.org and OpportunityZoneInvest research links are included with authority labels. Their current contents could not be independently read through this environment's network proxy. **No nomination/certification feed is connected. The pasted December 2026 timetable and claim that no final master list exists today were not verified and are not asserted as facts.** The production designation-evidence bundle is intentionally empty. No certification probability is computed. Census address-geocoder links provide an independent tract lookup for a source parcel's map point, with the point-versus-whole-parcel distinction shown.

## Validation scope

Unit coverage includes A/V versus X flood classification, unknown/conflicting codes, retry/cancellation, stale saved observations, risk demotion, profile proxy differences, acreage precision, geometry union/clipping, corridor classification, missing data and official-status authority/round/GEOID/date restrictions. Browser checks cover Deal Nav, next-door lookup, five-mile context, price boundaries, setback safeguards, KML safety and zoom persistence, alongside all previous executive/mobile/voice suites. These checks do not substitute for live county/source validation, deployed Pages hard-refresh acceptance or the outstanding physical-iPhone voice test.

Final local validation: **207 unit/API tests**, browser smoke, **57 executive**, **83 prior CEO/mobile**, **173 Sprint 1**, **26 acquisition**, **16 Deal Nav**, and **14 KML/OZ** checks passed. This is not a deployed-site or real-device acceptance certificate.
