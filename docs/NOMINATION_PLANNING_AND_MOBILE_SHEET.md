# Nomination research and mobile planning additions

The supplied proposal mixes useful research features with unverified financial and ownership conclusions. This implementation keeps the research features and separates observations from conclusions.

## Mobile workspace

Phones retain the three existing modes in a draggable bottom sheet with Map, Split and Details buttons. The sheet offers approximately 15%, 50% and 90% snaps, with a minimum peek height for readable tabs and 44px controls. Its resize handle supports pointer dragging and keyboard arrows/Home/End. A parcel selection opens Split from Map; explicit full dossiers remain open. Scrolling the drawer does not pan the map. Snap and mode changes reuse the map and preserve search criteria, overlays and records. They do not silently choose a new search center.

## Corridors and exact tract geometry

The nominated-area inventory offers three explicit municipality-based research presets. With the current uploaded snapshot they contain 36 Port/Turnpike, 18 Route 80/46/Meadowlands and 24 I-295/Delaware River/southern tracts. These are manually defined geographic research scopes, not verified industrial corridors, truck access or suitability scores. Rural flags remain a separate source-data filter.

The optional uploaded-boundary checkbox uses the supplied GeoJSON polygon rings after reconciling all 130 IDs with current dated evidence. Live NJ DCA boundaries remain the default. Snapshot geometry does not renew evidence dates or certify a parcel. Both paths use the existing upstream class/acreage filters, explicit-ID POST batches, count reconciliation and partial-result reporting. Deed date, sale price, building description and qualifier fields are included where the verified NJ schema publishes them.

The local scanner uses the same geometry and collector rather than the proposal's envelope-only, single-2,000-row request:

```sh
node scripts/scan-oz-nominated-industrial.mjs --list
node scripts/scan-oz-nominated-industrial.mjs --tract 34023980000 --min-acres 5 --total-limit 100
node scripts/scan-oz-nominated-industrial.mjs --corridor port --min-acres 2 --total-limit 5000
node scripts/scan-oz-nominated-industrial.mjs --all --min-acres 5 --total-limit 20000
```

Default output is `.radar/oz-research/nominated-industrial.json` plus CSV. Raw results stay outside published assets until reviewed. A capped or interrupted run stays partial; unqueried tracts remain explicit. Three consecutive unavailable sources stop the run. If every requested source fails, prior output is preserved. CSV sale observations suppress nominal/missing/placeholder sales and normalize readable dates; JSON preserves source facts separately. Exact parcel references and official/clearly labeled county research entry points are included in JSON. The scanner does not request owner, mailing or contact fields, guess centroids by averaging vertices, or call an operator an owner.

A live Carteret test retrieved one accepted parcel with a one-row cap and correctly reported partial coverage. This is a bounded API check, not a complete live 130-tract inventory.

## Selected-parcel comparison and planning

Deal Nav compares a meaningful, fresh NJ nomination observation against the older OZ 1.0 spatial reference. It uses parcel geometry rather than equating census IDs from different vintages. A missing, failed or stale reference stays unknown. The result distinguishes an older reference intersection from no intersection in the checked reference; it never labels a parcel newly certified or tax-qualified.

The worksheet displays published land/improvement allocations separately from a blank user-entered adjusted building basis. The user explicitly selects a 100% or 50% arithmetic illustration and a planning duration. Rural flags do not choose the percentage. Equality does not count as exceeding an assumed spending threshold. Dates are user planning targets; month-end arithmetic is clamped to valid calendar dates. Editing inputs invalidates a stale calculation/export. Reselecting the same parcel retains entered numbers; selecting a different parcel clears them to prevent cross-property budget mistakes. Scenario numbers remain in the tab and optional local download; they do not modify source parcel facts or enter hosted summary prompts.

## Claims from the proposal that were not adopted

- EPA/NJDEP operators or responsible parties do not establish property ownership or LLC control. Shared mailing recipients do not establish headquarters or a common-owner portfolio. Suite numbers and street types are preserved by the existing mailing-association feature.
- County systems and bulk name coverage have not been verified here. No guaranteed “100% owner unmasking” scraper is included. Exact county references, cited CSV import and published-name lookups remain available.
- An old deed date does not establish the current owner's holding period or motivation. Nominal consideration does not prove a family transfer. Assessment allocations are not adjusted tax basis or easy tax qualification.
- No November 27 certification deadline, guaranteed January 2027 tax result, first-mover pricing advantage or unsupported competitor-data limitation is asserted. The worksheet's assumed percentages and duration require separate legal applicability review.
- The earlier proposal's 72 “prime industrial” tracts came from a municipality-name substring screen, not parcel zoning or suitability evidence. These exact-match presets use transparent town lists and computed counts instead.
