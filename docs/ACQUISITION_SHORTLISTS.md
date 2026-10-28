# Public acquisition shortlists

Separate warehouse/distribution and industrial outdoor-storage research lists use the currently retrieved public parcel pool. Search first (for example, vacant land over 5 acres in Mangonia Park, FL), then use **Acquisition candidates**, or ask **Suggest acquisition candidates**. A combined request such as **Recommend industrial parcels over 5 acres in Edison NJ** searches and prepares both lists.

Each profile has its own minimum/maximum reported acreage. These filters narrow the original search; they do not discover parcels excluded by its location, assessment type, size, radius or year filters. Industrial and vacant assessment indicators are accepted for research. Residential/other classes, unknown acreage and quarantined acreage conflicts do not rank. This is not a determination of legal industrial zoning, physical vacancy or buildability.

The order is explicit: current public permission for that specific use, current official public-disposition offer, closeness to the midpoint of a user-specified acreage range, then distance to the search reference point. With no maximum, acreage is a qualifying minimum and proximity breaks ties. There is no arbitrary financial/suitability percentage. Missing owner data does not change rank, avoiding a disadvantage for redacted NJ records. Without distinguishing use evidence, both lists may contain the same parcels and explain why.

Cards show satellite imagery with the published parcel reference, acreage/location reasons, available dated assessment-name observations, sale/lease/auction status, use-specific approval/infrastructure status, environmental flags, unknowns, source/date, next checks and existing parcel/field-trip actions. Owner names never establish government ownership, title, beneficial control, seller authority or willingness to sell.

**Check ownership, flood & wetlands** checks up to three candidates per list, deduplicated across profiles (at most six parcels), with two workers, bounded existing source requests and a Stop button. Failed/missing coverage remains unknown; a mapped absence is not clearance. New searches or changed profile criteria cancel checks and invalidate displayed shortlists. Environmental checks retain their own source links and observation times.

Exports contain public parcel facts, profile, reasons, unknowns and source dates. Comps, contacts, private notes, dossier content, inferred owners and cached owner names are excluded.

## Government availability and industrial approvals: current limits

The production evidence bundle at `assets/data/public-acquisition-evidence.json` deliberately has **zero connected offer/approval/capacity sources and zero offer records**. Official state/federal portals could not be read from this environment: outbound CONNECT requests to NJ Treasury/DPMC, NJEDA, Florida DEP, GSA and ArcGIS content search returned proxy HTTP 403 on October 28, 2026. Their content, current offers and terms were not verified. Portal links are source-discovery entry points, not connected inventory.

Consequently the app currently produces **research candidates**, not confirmed properties to buy. **Only show parcels with a current official government sale/lease/auction offer** returns no verified matches with an explicit coverage explanation, never a claim that no government land exists. Explicit government-surplus recommendation requests enable that strict filter. This integration gap must remain visible until official parcel-specific sources are connected and live-validated.

Use permission differs by municipality and activity: warehouse/distribution permission does not prove outdoor-storage permission. Outdoor-storage material, paving, screening, setbacks, hours and environmental conditions require explicit records. Utility maps alone do not establish parcel service capacity. Gross reported acreage is not net usable acreage. Government ownership does not establish that a parcel is surplus, being offered, or transferable.

## Public-source adapter contract

Only controlled, explicitly enabled public-source adapters can contribute offer/permission/capacity evidence; pasted URLs and local research notes never upgrade those facts. A future integration must first verify the publishing agency, source license/terms, stable parcel identifiers and document meaning.

The bundle has `version: 1`, `sources` keyed by adapter ID, and `records`. A source declares `enabled`, exact HTTPS `origin`, `pathPrefix`, and permitted `kinds`. Each record requires:

- Exact `parcelKey` matching provider/state/jurisdiction/local ID; never an address-only or nearest-location join.
- `kind`: `public-offer`, `permitted-use` or `infrastructure`.
- `profile`: `warehouse` or `ios` for permissions/infrastructure; evidence does not cross profiles.
- `origin: official-source-adapter`, configured `sourceId`, `recordId`, and a credential-free HTTPS `sourceURL` under the allowed source origin/path.
- `publishedAt`, `checkedAt`, `validUntil` (an evidence recheck/expiration deadline); no future check, expired observation, or observation over 30 days old qualifies. An adapter must cap validity at any published bid/offer deadline and revoke sold/withdrawn/closed offers.
- `answer: yes` or `no`; conflicting current observations become a conflict requiring review.
- For government offers: `governmentDisposition: true`, explicit `agencyName`, `offerType: sale|lease|auction`, and `offerStatus`. A positive offer must explicitly be open. These fields require public documentary evidence, not inference from an assessor name.

Synthetic positive, negative, expired, stale, conflicting, cross-profile and wrong-parcel records are tested; none are included in the production bundle. Current source discovery is blocked, so this contract is integration preparation, not a live government-inventory feed.

## Validation and acceptance

Unit tests cover filter bounds, independent profiles, unsupported facts, exact identity, origin/path/date checks, government-name noninference, conflict handling, use-specific exclusion, failure/partial status and environmental uncertainty. `tests/acquisition-browser.py` covers chat, profile ranges, government-only behavior, public enrichment, satellite/parcel/trip actions, invalidation, export privacy and responsive layout. Both QA and Pages publication workflows run it.

Existing executive/mobile/voice tests remain required. Live Pages hard-refresh acceptance and a physical iPhone voice check remain separate, outstanding gates from Sprint 1; this change does not certify either. Live government-offer/approval adapter validation is additionally required before describing any shortlist as based on connected government inventory.

October 28 validation receipt: **159 unit/API tests**, **26 acquisition browser checks**, existing browser smoke, **56 executive**, **83 prior CEO/mobile**, and **173 Sprint 1** checks passed locally. Workflow YAML parsed successfully.

A read-only live public-data check for **Recommend industrial parcels over 5 acres within 2 miles of Edison NJ** returned **80 accepted industrial parcels**, complete retrieval, with five candidates in each profile. Every suggestion belonged to the actual retrieved pool and remained research-only with offer/permission unknown. The broader five-mile attempt had a public-service retrieval failure (no accepted records; not a zero-property conclusion); narrowing the request completed. These are changing public-source observations, not fixed test fixtures. The relay does not certify native browser CORS or a published Pages build.
