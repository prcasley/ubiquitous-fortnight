# Supplied fixes merged — November 2, 2026

Reviewed `capital-radar-fixes.zip` as proposed code/data, then merged its eight
replacement files against commit a46d792 and the in-progress CI/cap work. The
archive's APPLY.md and reported live test counts were reference material, not
independently verified deployment results. No internal lead lists or owner-contact
bundles were added.

## Applied behavior

- Florida industrial searches retain parcels explicitly labeled vacant industrial,
  including county `VACANT INDUSTRIAL` and DOR 040. Generic vacant commercial or
  unknown vacant land does not become industrial through this rule.
- Added WPB-area (airport industrial core) and Delray Beach presets, plus an 8-mile
  radius option. WPB-area selection defaults to 8 miles. Corrected the parser so
  the explicit airport reference is preserved instead of reverting to downtown;
  Delray is also recognized as a supported place fragment.
- The airport-radius explanation avoids the supplied text's unverified assertion
  that it covers every qualifying parcel in three municipalities. It remains a
  radius search, not a certified complete municipal inventory.
- Raised the bounded retrieval/reference-check limits to 1,600 as supplied.
  Server-side acreage filtering and multipart consolidation remain. Partial
  nearby searches explicitly warn that closer sites may be missing; ordering is
  within the retrieved subset.
- Added the supplied Northampton MUNI-code/name reference (38 municipalities),
  with county URL/date and a caveat when spatial verification has not occurred.
  An optional lookup verifies the county's actual municipal-layer schema and
  response count, then joins names at each parcel map reference point. Ambiguous,
  incomplete or unavailable boundaries do not invent a town or block parcel
  retrieval. Boundary position is not a zoning or whole-parcel jurisdiction ruling.
- Added the supplied Northampton 7xx industrial, 3xx multifamily and 4xx/5xx
  commercial screening families, scoped to that county and used only without a
  stronger published domain/renderer definition. These are supplied broad-family
  mappings based on reported improvement-name observations, not an independently
  verified exhaustive LUC codebook. Exact use and zoning remain unverified;
  unmatched codes remain Other. Vacant-only mode still refuses when unsupported.
  Numeric fields use numeric ranges; string fields use the supplied prefix query.
- Retained official renderer-label support and prevented family fallbacks from
  overriding conflicting official code definitions.

## CI reliability

- Explicit desktop viewport/device scale, non-animated focus, a second fit after
  layout, and up to eight seconds of polling for stable projected parcel bounds.
  The assertion checks meaningful visibility/centering rather than exact equality
  to one computed zoom on every renderer. Large parcels may correctly use <16.
- Focus failures retain viewport, map size/bounds, zoom and parcel diagnostics plus
  a screenshot. Both workflows upload per-suite artifacts even on failure.
- A shared runner executes all 13 browser suites despite earlier suite failures,
  records JSON/JUnit summaries and returns a failing exit code if any suite fails.
  Two runner contract tests verify continuation after an assertion failure or timeout.
- CI explicitly uses Playwright's pinned managed Chromium. Local tests can select
  an executable; this environment's managed-browser download was denied by its
  network proxy. Thus local system-Chromium passes are not a GitHub CI verdict.

The county/Pages/GitHub Actions endpoints remain restricted from this environment.
The archive's reported live counts, source sampling and remote green status cannot
be independently confirmed here. The county municipal endpoint is now supplied by
the archive, replacing the earlier unconfigured PennDOT/PASDA discovery attempt.

## Validation

254 unit/API tests, two runner contract tests and all 13 browser suites passed
locally. The final 13/13 result came from the same shared runner used by both CI
workflows against a finished, unchanged static build. Focus/preset, 1,263-row
completion and 1,600-row partial-cap cases are covered. The first local aggregate
run caught two failures during a concurrent rebuild; those logs were preserved,
and the full runner passed after the build was held fixed. Workflow YAML, build
asset verification and staged secret/held-file checks also passed. Remote GitHub
Actions status remains unverified because API access returned 403.
