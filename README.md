# Capital Radar | Public GIS Research Preview

**This repository is a public, browser-based parcel-research interface.** It does not include Woodmont proprietary application modules, internal properties or portfolios, contacts, comps, sales or lease transactions, business-development notes, private scoring, private documents, or API credentials. It is not the private Woodmont Capital Radar product.

## Live sources
- **Florida**: [Florida Department of Revenue 2026 statewide parcel-centroid layer](https://services9.arcgis.com/Gh9awoU677aKree0/ArcGIS/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0) via Florida geographic information services. Uses PARCEL_ID, OWN_NAME, PHY_ADDR1/PHY_CITY, LND_SQFOOT, DOR_UC, ASMNT_YR. GIS centroids are not legal boundary surveys. Source-level redactions are honored. Reported acreage = LND_SQFOOT / 43,560.
- **New Jersey**: [NJGIN statewide parcel composite](https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0) via public NJGIS. Uses PAMS_PIN, PROP_LOC, MUN_NAME, PROP_CLASS, CALC_ACRE and parcel geometry. The statewide layer does not publish owner names.

The app sends live, unauthenticated, read-only queries to the corresponding source's ArcGIS REST endpoint at the time of each scan. No private dataset is embedded in the repository. Basemap tiles are from OpenStreetMap or Esri. An ArcGIS world geocoder handles optional typed-location searches.

## Functionality
- Live radius scan for NJ and FL around a selected map point, saved market center, recognized street address, or user-permitted GPS coordinates.
- Industrial assessment-use filter, minimum-acre filter and all-use filter.
- Source-record acreage, parcel IDs, public assessor owner labels (FL only), source links and assessment vintage.
- Public parcel maps and per-parcel detail cards with source/provenance labels.
- Read-only owner-name grouping of returned Florida assessment records, not an assertion of beneficial ownership.
- Local deterministic Ask Radar text summary of the last completed returned scan.
- Responsive, mobile-usable interface.

## Important limitations
- **No transaction or comparable-sales records whatsoever**. No internal comps, comps calculations or financial figures.
- **Not nationwide**: this version has live source adapters for New Jersey and Florida only. Source-query network policy, CORS, service interruptions, tile access, and location permission affect availability.
- This is a direct-source prototype. A 1,100-record guard refuses oversized searches rather than falsely reporting zero parcels. Increase filters or narrow radius.
- The NJ layer intentionally redacts owner names, and only assessment names (not title-verified legal owners or LLC beneficial owners) are returned in Florida.
- FL industrial classes use DOR_UC 0040-0049; NJ industrial uses PROP_CLASS 4B. These are assessment classes, **not zoning determinations**.
- The Florida "Vacant" filter is intentionally unavailable pending a verified DOR use-code mapping. Select "All uses" instead.
- No full nationwide live backend, secure executive sign-in, or internal SharePoint sync is provided by this public website.
- Data use must follow the public source provider's applicable use terms and attribution requirements.

## Deployment
Static files under `index.html` and `assets/` can be hosted on GitHub Pages using `main` / `(root)`. Because this repository is public, never add confidential Woodmont material or credentials.

## Verification state
The official source schemas and endpoints have been checked against public ArcGIS documentation. **End-to-end network requests, live CORS responses, on-device GPS, and rendered result accuracy have not yet passed a live device test**. Do not treat the site as production-validated until those are exercised on the deployed Pages site.