# Official NJ nomination status across executive research

The Newark follow-up previously checked third-party OZ2 eligibility even though the app had the NJ nomination layer. That could make an executive interpret eligibility-only parcels as nominated. NJ follow-ups now query the official NJ DCA nomination boundaries and reconcile every hit with the connected, dated 130-tract evidence bundle. Third-party eligibility is not used as a fallback nomination result or counted as an NJ nomination.

## Routing and wording

`OZ 2`, `OZ2`, `opportunity zone(s)` and `nominated`/`nomination(s)` route to official NJ nomination checks for NJ results. A reference-only follow-up preserves the existing search. An explicitly requested OZ1 check remains separate. Mixed-state results check the NJ subset and identify other states as lacking connected official nomination feeds. FL/PA retain their reference checks, with the explicit missing-state-nomination-list line.

Answers count parcel/boundary intersections, not whole-parcel inclusion, project qualification or Treasury certification. Each positive NJ card says `NJ-nominated OZ 2.0 tract …`, names the municipality and provides the check date and state-nomination/federal-certification distinction. No-match, pending, unavailable and expired results are distinct. An unavailable check never becomes a zero-nomination conclusion. Per-parcel matches list municipality and tract ID. Board summaries keep NJ nominations separate from OZ1 and third-party eligibility.

## Automatic propagation

`radar-oz-observations.js` checks NJ results after complete/partial scans and selected-property inspection. It shares in-flight work, bounds reuse to the current scan and recently checked evidence, and ignores results from a superseded scan. Owner fields, contacts and notes are not sent; the source requests use parcel geometry bounds and tract fields only. No new hosted-model payload fields were introduced.

The shared property formatter/snapshot carries verified nomination evidence to chat cards, the native parcel list and details, acquisition shortlists, executive industrial briefs, Deal Nav, saved trip stops and printable field packs. Imported legacy NJ `oz2` eligibility observations cannot be displayed as NJ nominations. Packs check their NJ stops before export even if chat was never used; an unavailable lookup is explicitly labelled. Updating a stop's OZ observation preserves its notes, photos and position. Opening a property retains the current search criteria/results.

A Newark area option was added to the executive industrial form so its brief can be researched directly. Existing saved-area behavior remains.

## Regression cases

The synthetic Newark case deliberately makes all five parcels intersect third-party eligible tract `34013006800`, while only one intersects official nominated tract `34013001000`. Tests verify automatic status before an OZ question, all four phrasings, no search reset, source/town labels, board share, acquisition/industrial brief, Deal Nav, pack download without chat, source outage, FL/PA missing-feed labels and phone width. These are synthetic classifications, not claimed live Newark result counts.

Pure tests cover legacy eligibility imports, nomination snapshot/export preservation, unknown/expired status, FL/PA separation and repeated official tract identities. The standard QA/publication runner now includes 16 browser suites. NJ's source/evidence dates and federal certification remain separate; a state nomination does not predict federal approval or tax eligibility.

Validation: 277/277 application tests, 19/19 Python checks, the public build and a clean run of all 16 browser suites passed locally. The dedicated Newark suite passed 22 cross-surface/routing checks, including FL/PA fallback and unavailable-source behavior. GitHub deployment and live Newark counts are not claimed by these synthetic results.
