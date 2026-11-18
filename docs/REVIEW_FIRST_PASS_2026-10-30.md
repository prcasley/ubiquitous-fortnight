# Review first pass — October 30, 2026

This implements a bounded first pass from the external review. It does not adopt the PDF's instructions wholesale or introduce a speculative financial score.

## Delivered

- **GIS resilience:** read-only parcel requests retry transient fetch failures, timeouts, unreadable responses, HTTP 408/429/5xx and transient ArcGIS error codes. Invalid queries do not retry. Each attempt has a 12-second budget; three attempts with 0.5/1-second backoff keep the maximum near the previous 40-second single-query budget. Explicit cancellation aborts the request/backoff and never claims zero inventory. Permanent CORS restrictions can still require a backend proxy or ingested data; retries cannot override browser access rules.
- **Satellite focus:** invalidate the map size before fitting the parcel and disable the focus animation. Keep the complete parcel visible instead of enforcing an arbitrary minimum zoom that can crop a large parcel. Point records still use zoom 17. The existing satellite-focus smoke check passes.
- **Executive error text:** use a short incomplete/unavailable message and a clear “More properties may exist” qualification. Put raw source diagnostics under a collapsed **Source details** control.
- **Current metadata exposure:** neutralize the snapshot's identifying source filename and remove its source-file fingerprint from the public dataset. The original filename/fingerprint are retained in ignored local lineage metadata. Parcel facts remain intact. Documentation and regeneration scripts no longer insert the firm name. This does not erase previously published copies or Git history, conceal the repository owner's identity, or make a public target list confidential.
- **Courtesy-screen wording:** the form now asks for a welcome code. The requested WP123 screen still deters casual entry, but remains a courtesy screen rather than authentication.
- **Content security policy:** static app policy allows local scripts, the used GIS endpoints and HTTPS map imagery while blocking arbitrary inline scripts and dynamic evaluation. Inline styles remain necessary for Leaflet/UI rendering. Only the exact `window.print()` handler is allowed by hash so field packs remain printable. The authenticated backend additionally denies framing and sets request IDs/security headers on API responses.
- **Backend protection:** shared-login failures are throttled by socket peer (20 per 10-minute window, bounded in-memory state). Forged forwarding headers do not bypass throttling. Errors return generic text and a request ID, with only sanitized diagnostic metadata logged. This is an incremental safeguard, not named-user access or a durable audit log. A reverse proxy may group users under one peer; production needs a configured trusted-client identity/authentication layer.
- **Storage configuration:** production startup and imports require an explicit non-temporary database path and a persistent-storage declaration. The free Render template is explicitly development/test and remains disposable. `render.production.yaml` is an optional paid-disk proposal, with `/var/data` mounting, not an executed deployment or purchase. Persistence depends on actually attaching the disk; the environment declaration is not proof that a filesystem is durable.

## Validation

229 unit/API checks and eleven browser suites pass. New tests exercise transient recovery, cancellation, bounded retries, stable satellite focus, collapsed diagnostics, real CSP enforcement, the narrowly allowed print action, login throttling, generic errors/request IDs and production storage refusal. Existing suites continue to run with CSP enforced; their polling helper uses DevTools evaluation instead of Playwright's eval-based page waiter. Published-data checks include the JSON payload and docs rather than HTML/JS only.

## Not in this pass

No private repository conversion, force-push/history rewrite, paid hosting purchase, live Render deployment, named-user/SSO integration, public GIS ingestion/proxy cache, scheduled backups, new ownership-resolution feed, comps feed, entity-control inference, outreach, or “Steal Score.” Full source archives and the held rankings/strategy/transaction references remain outside the published app. Any future scoring should distinguish verified suitability and evidence quality from an unsupported assertion that a property is undervalued or an owner wants to sell.

The deployed Pages site and live county availability cannot be independently verified through this environment's network restrictions. The user should hard-refresh after publication and re-test the previously failing live searches. A physical iPhone acceptance test remains outstanding.
