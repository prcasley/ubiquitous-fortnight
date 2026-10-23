# Capital Radar | Public Demo

> **PUBLIC SANDBOX. ALL DATA IS FICTIONAL.** Not Woodmont's production Capital Radar application, not a real acquisition tool, and not a property ownership or assessor database.

A self-contained, mobile-friendly static user-interface demonstration for evaluating the **executive experience** of a commercial real estate research app. Developed as a clean-room demonstration with newly written code. Does not embed, copy, or expose Woodmont's Capital Radar proprietary code, live databases, personal contacts, company research, deal strategy, source registries, or Master Comps workbook.

## What it does

- Responsive overview, property search, demo map, fictional company profiles, fictional comps, and a rules-based demo Q&A panel.
- 12 deliberately fictional properties. Sample pins use illustrative coordinates in real U.S. cities **but represent no actual parcel, company, ownership or availability**.
- Filter by U.S. state, illustrated asset type, illustrative acreage; search for phrases such as `industrial over 15 acres in NJ`.
- Public street tiles via OpenStreetMap and optional satellite tiles via Esri, with credits; when map CDNs cannot load, the list remains usable.
- Synthetic property detail cards, a local-only shortlist, and an external map link. No data is transmitted to an AI service.

## What it does NOT do

- No legitimate parcel discovery, deed ownership verification, location-precise acquisition site identity, OZ designation, investment decision, live scanner, actual comps or real company data.
- No authentication or password protection. The GitHub repository and, if enabled, GitHub Pages are **public**.
- No sensitive values, API keys, contact details, or connection to any production environment.
- Geolocation is not automatically requested. A phone's location is not stored or sent to our servers. Third-party base-map servers may receive tile coordinates and normal browser information.

## View locally

Open `index.html` in Edge or Chrome. No server, build, local packages or .bat file required. Live map tiles need an internet connection and permission to load external assets. If tiles are unavailable, the functional list and company screens still work.

## GitHub Pages publication

The repository may be public even when Pages is not enabled. An authorized repo admin can use **Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save** to publish the sandbox. The URL should then have the pattern `https://OWNER.github.io/REPO/`; do not assume that a live site exists until GitHub reports a deployed Pages link.

## Important business / security conditions

- This is a **public demonstration** and must remain entirely fictional. Do not add real Woodmont data or upload proprietary Radar code here.
- Company publication, branding and hosting must be approved before using the public demo to represent Woodmont officially.
- The real mobile app can use permission-restricted SharePoint/Power Apps (Standard) and approved data; the full scanner requires a separate authorized live-service architecture.
- This repository should never be connected to the confidential Radar export, SharePoint source folder or private acquisition brief.

## Check after publication

1. Open the site in a private browser tab and on a real phone. Confirm the green **PUBLIC DEMO** banner is visible.
2. Search `industrial over 15 acres in NJ`, open a sample detail card, and check labels say fictional.
3. Open map, switch Street/Satellite, and test a marker. If imagery is blocked, record the browser/network issue.
4. Use the fictional Company, Comps and Ask Radar sections.
5. Review the public code and network requests; confirm no company data, API keys or private services are present.

## Data provenance

All example company names, property names, scores, acreage, square footage, prices and transaction records were manually invented for this UI demonstration on 2026-10-21. Coordinates are approximate illustrative city locations, not the positions of any claimed legal parcels. No source citations can establish these fictional records.