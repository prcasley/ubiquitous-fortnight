# Sunbiz company-filing workflow

Sunbiz can be incorporated into the public Radar screens even when this execution environment cannot open it. Opening a link in a separate browser tab and fetching its HTML from JavaScript are different capabilities: Sunbiz controls cross-origin reads. The Pages site cannot bypass those controls or execute an authenticated backend by itself.

## What changed

Florida company dossiers now include a Sunbiz workflow:

1. Company-name and document-number searches open the official site. Corporate document-number suggestions from the user's report are marked **unverified**. No supplied officer names, personal addresses, phones or tax IDs are published in that hints file.
2. Paste the exact official filing-detail URL and select the source observation date. “Try reading the official filing” makes one credential-free, redirect-blocked request, limited to the official Sunbiz filing-detail host/path. The app's content-security policy permits that exact host. HTTP/CORS/network failures explain the fallback instead of claiming roles were resolved.
3. Import a saved `.html`/`.txt` filing page, or paste text copied from the official page. This is a local read; no uploaded source file is sent to a server/model. HTML is inert, resource attributes and executable blocks are removed, and only parsed text fields are displayed.
4. The preview requires the filing entity to match the selected assessment company and checks the entered document number and any document identifier in the source URL. A related company is not silently substituted. Unsupported/unparseable content stays unloaded; manual source-evidence entry remains available.
5. Review the source and explicitly confirm before saving. The dossier records company/document/status, dated officer/member/registered-agent role observations, capture method and source URL. Only names/roles are retained from the role sections; their street addresses and the raw page are not stored. A filing role does not establish beneficial ownership, title, current operations or authority to sell. No business contact or owner field is automatically populated.
6. Saved filings remain in browser-local research, survive reload and are included in the local ownership JSON backup. They are excluded from hosted-summary payloads and public datasets. A physical-device/browser storage backup is still the user's responsibility.

User review is explicitly labeled **reviewed by user**, not independent agency verification. An imported/pasted page does not authenticate its origin. Direct-fetch success is checked with synthetic CORS-permitted HTML; the live Sunbiz host remains blocked by this environment's proxy, so actual source cross-origin behavior is unverified here. No unauthenticated proxy, personal skip tracing or automatic outreach is introduced.

## 6738 Wallis Road

The county source identifies PCN `00424327050051770`, `6738 WALLIS RD`, assessment name `EVERGLADES BOTANICAL LLC`, `OPEN STORAGE`, 2.9042 reported acres and a recorded July 20, 2011 transfer for $850,000. These are assessment/recorded-transfer observations, not title or the current owner's holding period.

The supplied report suggests Sunbiz document `L11000083121`; it also mentions `L21000405490` in a related-entity context. Both remain unverified suggestions. A filing naming `6738 INVESTMENTS LLC` will not be accepted as the filing for `EVERGLADES BOTANICAL LLC`. The report's claimed manager roles and related operating-business affiliation were not automatically confirmed or promoted to contacts.

To use it: find/select 6738 Wallis Road → Ownership & Field Pack → EVERGLADES BOTANICAL LLC → Open research dossier → Sunbiz company filing. Open the official page, then use direct read or the local page/text fallback and review confirmation.

## The rest of the supplied report

The attachment is identical to the previously reviewed 25-target report. County IDs, situs/use labels and assessment-name text have been compared; the one conflicting acreage value remains flagged. The report's 42 “resolved” principals, seller-propensity scores, inferred holding periods, common control and sale authority are not verified source findings and were not published as such. Full source findings and the current feature matrix are in `CEO_PILOT_2026-11-06.md`.
