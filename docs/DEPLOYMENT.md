# Deployment and test access

## Public map/research screens

The `pages-build.yml` workflow builds and deploys `dist/` when `main` changes or when manually dispatched. GitHub Pages must be enabled for the repository. GitHub Pages serves static files; hosted summaries and private database routes require the backend below.

Pinned Leaflet/Turf runtime assets are also tracked for compatibility with an existing Pages deployment from the repository root. They are generated from the checksum-locked npm dependencies; use `npm ci` and `npm run build` to refresh them.

No provider/model names appear in the executive UI. Static-only hosting disables summaries with a neutral message; it never embeds a provider key.

## Hosted test deployment

[Deploy the backend on Render](https://render.com/deploy?repo=https://github.com/prcasley/ubiquitous-fortnight).

This requires a Render account and access to the repository. The checked-in `render.yaml` selects a free test service, builds the app and runs the authenticated backend. The deployment link is an account/setup entry point, not a live application URL. No Render deployment has been created from this cloud task.

During setup, enter the existing provider key securely as `NIM_API_KEY`. Do not paste it into chat or commit it. Render generates `RADAR_WORKSPACE_PASSWORD`; retrieve it from that service's environment settings to log in as `radar`. The application URL is the service URL Render assigns. Open its root path for the scanner or `/workspace.html` for private research.

The free test service uses an **ephemeral database** under `/tmp`. Imports, server-saved lists and alerts can disappear when the service restarts or redeploys. Browser-saved public notes remain in that browser. Do not rely on this test deployment for durable private research. A persistent disk/database and appropriate paid hosting, if chosen later, need separate configuration and approval.

The server defaults to loopback locally. Render sets `HOST=0.0.0.0` behind its HTTPS ingress; application routes remain password protected. `/healthz` exposes only a minimal health status so the hosting service can check readiness. The provider key stays server-side.

This is a single-user test login. Executive production deployment still needs organizational access controls and a durable data plan.
