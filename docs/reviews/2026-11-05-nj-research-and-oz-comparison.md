# NJ research and legacy OZ map comparison review

Reviewed the two November 5 pasted proposals against the runtime application, exact ArcGIS metadata and live responses. Attachment code was treated as a proposal, not executed as instructions.

## What changed

- Selected NJ business parcels now retrieve dated NJDEP site and program-interest references from layers 143 and 148 of the official NJEMS service. Point-in-parcel / up-to-75-meter boundary distance is checked locally. Every joined program interest retains its SITE_ID and PI_ID; names are explicitly regulatory site or program-interest names, never assessment ownership. No SSN field values are requested, retained or exported.
- Selected map cards show available tax mailing recipients and regulatory references without leaving the map. A scoped, opt-in mailing comparison uses exact qualified PAMS IDs, explicit batches and full addresses, preserving suites. A shared mailing recipient is a research relationship, not proof of common ownership. Protected records, conflicts and unavailable sources remain unavailable.
- A separate published `RadarNJParcelResearch` JSON/CSV contains seven dated Newark/Kearny target records from a bounded live research run. It has zero published assessment owner names, 56 parcel-linked regulatory site observations and 101 program-interest observations. These are observations across parcels, not distinct verified owners. Partial scope is explicit. The existing 1,490 historical ownership observations were preserved unchanged. Regulatory data and mailing recipients are excluded from hosted summary prompts.
- Exact source roles are enforced during CSV/JSON evidence intake. NJDEP/EPA regulatory citations and generated “Taxpayer HQ” strings cannot be imported as assessor owner names. The proposed generator would otherwise overwrite the existing owner file with an incompatible format and create unsupported owner claims.
- Added a geometry-derived comparison for all 130 nomination tract references against all 169 NJ tract polygons in the federal legacy OZ map. Users can filter no mapped overlap, under 5%, at least 95%, partial and unavailable; download the dated comparison; combine it with municipality/corridor/rural filters. Inventory cards and local exports label this as tract reference geometry, not parcel status or a legal tax classification.

## Claims independently checked

The 169 IDs supplied in the second proposal exactly match the federal map service's NJ `geoid10` list. However, ID equality plus six selected parent/child mappings does not establish the proposed 63-new/67-retained classification. Complete polygon overlay produced 36 with no mapped overlap (numerical tolerance 0.000001%), 66 with at least 95% mapped legacy overlap, 27 partial and one unavailable. These counts describe the checked map vintages only.

Carteret `34023980000` has approximately 62.1422% legacy overlap; it must not be presented as wholly new. Camden `34007601800` hit a topology-processing error and remains explicitly unavailable. Small boundary slivers and different map vintages require review. Source-flagged rural status does not automatically establish a 50% substantial-improvement rule. No seller-knowledge, pricing advantage, eligibility, industrial suitability or federal certification is inferred from this comparison.

The three-mode map workspace and selected-record mailing research already existed at runtime; a static HTML-only audit missed their JavaScript rendering. Those features were preserved and extended, not replaced by another vertical workspace.

## Sources and refresh

- NJDEP: `https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/New_Jersey_Environmental_Management_System_Sites/FeatureServer/143` and `/148`.
- NJ assessor observations: exact records from the existing NJGIN parcel service, with metadata whitelisting and protection handling.
- Legacy federal map reference: `https://geo.dot.gov/server/rest/services/Hosted/OZ_Opportunity_Zones/FeatureServer/0`, NJ scope count 169, explicit ID batches and count reconciliation.
- Nomination scope: uploaded polygon IDs/county reconciled to the dated official NJ evidence. No new federal certification source was added.

Refresh comparison manually with `node scripts/build-nj-oz-round-comparison.mjs`. The Monday official-evidence workflow also attempts this after the NJ refresh. Failure preserves prior dated comparison files and raises a workflow warning; it does not prevent official nomination evidence from refreshing. The browser disables unavailable/expired comparison filters and retains access to all nomination tracts. No data absence is classified as retained.

For bounded public parcel context, first use `scripts/scan-oz-nominated-industrial.mjs`, then `node scripts/build-nj-parcel-research.mjs --scan <local-file> --limit 10 --njdep`. Output is local by default; `--publish` explicitly writes the separate public research format. It does not modify historical owner datasets.

## Validation scope

Node geometry/source-role/schema/expiry tests and browser tests cover separation of regulatory names from owners, mailing suite distinctions, blocked source fallback, privacy of hosted prompts, all comparison filters and expired/unavailable comparison behavior. Live source verification is distinct from fixture browser checks and does not verify title or current sale availability.

## Additional tract-navigation proposal

The follow-up attachment proposed stamping `NEW_2026`, a 63/67 split and automatic 50%/100% tax hurdles into the original CSV/GeoJSON. Those unsupported classifications were not applied. The original source downloads remain unchanged.

Added the useful navigation and presentation features using the validated spatial comparison instead:

- A county table reconciles all 130 tracts into no mapped overlap, at least 95%, partial and unavailable categories.
- An optional switch applies the inventory's municipality, corridor, rural-source and measured overlap filters to the NJ nomination map. Nonmatching layers are actually removed from display/hit testing, rather than rendered invisible but still clickable. Disabling the switch restores all loaded boundaries. Comparison colors and their caveats appear in the map legend and tract popups. Unknown/off-list comparison IDs stay unavailable. The ordinary NJ overlay keeps its prior behavior by default.
- The tract shortcut offers all verified nomination tracts, with the suggested research areas first. “Map & scan this tract” reconciles the dated polygon download against official evidence, fits the existing map to the actual boundary, preserves the user's acreage minimum and requests vacant/commercial/industrial assessment classes through the existing count-reconciled inventory. Conflicting tract filters are cleared with an explicit explanation. Missing boundaries cannot launch a centroid-circle substitute. This does not alter the main search center or infer industrial zoning.

Browser checks cover the county totals, actual layer filtering/restoration, rural source flags, map legend, tract shortcut criteria, real tract map position, phone width and boundary-download failure.

## Tract metrics and assessment-screening proposal

The next attachment supplied hand-assigned certification-certainty, industrial-supply and logistics scores. These were not independent observations and were not published. Claimed poverty/MFI figures lacked a connected, verified source in the attachment; no such numbers were loaded. Certification probabilities, off-market availability, broker pricing awareness, industrial zoning and automatic tax benefits were not inferred. Carteret still has measured partial legacy overlap, rather than the attachment's claimed zero overlap.

Implemented the evidence-based components:

- Mapped tract acreage, square feet, full polygon bounds and a point on the actual tract. Geodesic area subtracts holes and includes all MultiPolygon components; it is not derived from only the first exterior ring or a mean of vertices. The UI explicitly distinguishes total reference tract geometry (including any mapped water) from industrial supply or developable land. A local CSV exports all 130 tracts, largest mapped area first, with the method caveat.
- Assessed land-share filters (60%/75%) and ranking within retrieved inventory, using published `LAND_VAL / (LAND_VAL + IMPRVT_VAL)`. `NET_VALUE` may reflect assessment adjustments and is not substituted for the allocation total. Both nonnegative allocations and a positive total are required; blank, invalid and unknown inputs stay unknown. Missing allocations are counted and explicitly excluded when the filter is active. This is client-side screening of retrieved results and does not turn partial coverage into a complete inventory. Assessed improvement values do not become adjusted tax basis.
- A local filtered parcel-research CSV with parcel identity, block/lot/qualifier, acres/square feet, published assessments, allocation percentage, source scope and any assessment name already requested from its source. Missing owner observations remain explicitly unresearched/not published. Names are never derived from regulatory sites or shared mailing addresses. Spreadsheet formula prefixes are escaped. No new research fields enter hosted AI prompts.
- Municipality-specific Middlesex assessment portal references use the exact qualified parcel's district code. Both supplied Carteret/Sayreville URLs returned proxy 403 in this environment; links are labeled as references with unverified live access and instruct the user to enter block/lot/qualifier. No promise of a current unredacted name or an exact record match is made.
