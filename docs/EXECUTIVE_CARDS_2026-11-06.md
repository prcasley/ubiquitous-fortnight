# Executive parcel cards

Chat results, selected map parcels, Deal Nav subjects, acquisition candidates and industrial-brief cards now use shared high-contrast navy/cyan/gold executive facts. Addresses, acreage and the primary linked research name use at least 22px; action routes have 48px minimum touch targets. The existing three-mode persistent-map workspace remains intact.

The first view shows address/type/acreage, concise OZ evidence status, a linked assessment or other research name, available contact routes and assessment amounts. Original IDs, source URLs/dates, years, geometry notes, full OZ observations, acquisition reasoning and caveats remain in the collapsed **View Technical & Source Records** drawer. Existing controls are moved, not recreated, preserving listeners and source behavior.

Names retain their evidence role. A current published assessment name takes priority over an explicitly historical imported assessment; a regulatory site can supply a clearly labeled site reference when no assessment name is known. Tax mailing addresses are never promoted to headquarters. Raw supplied principal/operator claims are not presented as verified owners. Related Sunbiz entities and agents do not establish beneficial control or authority to sell. Protected current records do not use a historical-name fallback.

Phone/email actions are available only for source-cited, user-reviewed business contacts attached to the selected parcel's researched company dossier. These contacts stay local and outside hosted summary payloads. Source links stay directly on names. Mailing-address actions open a map of the published recipient address, not a claim about ownership or the property location. When no route is connected, a large research action opens the selected-property workspace.

Missing financial values prompt an assessment request rather than displaying zero. Published zero improvements remain zero. Assessment land/improvements/total values and land-allocation share are labeled as assessments; they are not asking prices, market values, acquisition tax basis or the legal OZ substantial-improvement requirement. The supplied component's “verified principal,” “tax headquarters” and “OZ building hurdle” labels were deliberately replaced with evidence-accurate wording.

NJ nomination status retains the existing dated evidence and 95% parcel-area screening rule. Boundary/point-only intersections do not become positive nomination labels. Florida eligibility remains distinct from nomination, and no card claims new-round federal certification from an eligibility or state nomination source.

The supplied HTML template was used as a design reference. Rendering uses DOM text nodes and validated URLs rather than interpolating uploaded names/addresses into HTML.

Validation: 397 JavaScript tests, 72 Python tests, and all 30 browser suites covered across the full run and corrective reruns. The final shared presentation was rechecked in 11 affected browser suites, including source drawers, map focus, mobile controls, contact routes, nomination/eligibility evidence and summary privacy. Late-created map notices use the Scan drawer; unchanged evidence updates preserve focused contact controls. Live Pages and remote CI are not certified by these local fixture runs.
