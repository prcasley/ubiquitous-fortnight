# Reviewed NJ release patch and legacy PR #6

## NJ release coverage and refresh

Applied the supplied release-coverage patch, including the correction to build `dist/` before Node tests in the weekly refresh workflow. The private API test serves that output; running tests first on a fresh checkout can return 404.

The post-refresh guard checks the supplied 130-tract nomination snapshot, 20 counties and 60 municipality labels. South Hackensack/Teterboro is one combined source label; these are source labels, not a count of individual municipalities inferred from a combined entry. A pinned baseline in `tests/data/nj-oz-release-20261029.json` catches same-count tract replacement as well as county/municipality remapping. Source authority, round, exact official-record queries and timezone-aware validity windows are checked. A legitimate nomination change requires reviewing/updating the baseline rather than silently publishing it. Separately sourced federal evidence is not reclassified by this guard.

Announcement links now use the supplied corrected canonical URL:
https://www.nj.gov/dca/news/news/2026/approved/20261029.shtml

The `approved/` folder does not establish federal certification. The workspace returned HTTP 403 for both forms of this corrected government URL; the snapshot/release cross-check is not an independent live government verification performed here. No eligible-tract total, projected federal deadline or lack-of-eligibility claim was added based only on the pasted report.

The NJ parcel inventory now includes published LAND_VAL, IMPRVT_VAL and NET_VALUE. Cards label these as assessment observations, distinct from asking prices and verified market values. Missing values stay missing; numeric zero can be displayed as a published value. Owner/contact boundaries remain unchanged: exact-ID on-request owner observations and cited browser-local business contacts; no title/control inference or public contact dataset.

## Reusable overlay stress test

The supplied script depended on an absent `muni_points.json`. `scripts/live-nj-oz-stress.py` derives map points from the 130 loaded source polygons instead, reconciles them with the release baseline, opens the actual entry screen, supports the available Chromium executable and writes diagnostic JSON under ignored `test-results/`. It uses real map taps for popup tests. No model or extra parcel/owner data is downloaded by the stress test.

```sh
python3 scripts/live-nj-oz-stress.py
python3 scripts/live-nj-oz-stress.py --fixture
```

The first command uses the published Pages site and government GIS; a tunnel/proxy denial exits 2 with a blocked result, not a passing test. The second uses explicitly synthetic geometries and the same stress assertions. The fixture suite is registered in the standard browser runner (15 suites total). Its 20 checks cover every municipality label, exact overview IDs, popup qualification and source links, toggle/pan races, zoom-out coverage, phone tap targets, outages, malformed/truncated responses and slow loading. Chromium phone emulation is not a real-iPhone or voice test.

A separate read-only **Live NJ nomination overlay diagnostics** workflow can be launched manually from GitHub Actions after the updated site is published. It does not gate publication on third-party network availability and uploads the JSON results.

## Legacy PR #6

Reviewed `refs/pull/6/head` at `7275526`. Reproduced JavaScript parse failures in `assets/radar-live.js` and `assets/radar-nemotron-browser.js`: four literal escaped-newline separators occurred outside strings. A detached local repair worktree replaces only those separators and adds parsing and company-name behavior checks. The PR's original regression tests plus those added checks passed (12 tests); neither browser nor model code was executed by the parse checks.

The exact repair is retained locally at `.radar/pr6-syntax-repair.patch`; it is not applied to main or pushed to the PR branch. A merge preview confirms content conflicts in `assets/radar-live.js` and `tests/public-gis.test.mjs`, plus a modify/delete conflict for the old browser-model file. Main removed that browser-model design and already has separate exact-ID ownership research and hosted summaries that exclude owner/contact/private observations. Merging the old branch wholesale would reverse that architecture. No local inference, model download, executive-facing provider branding or private comps were introduced.

Local validation of this change: 265 Node tests; 19 Python checks; workflow YAML parsing; the public build; and KML/OZ (23 checks), inventory (21), executive (57) and overlay stress (20) browser suites all passed. The live stress attempt failed at initial Pages navigation with `ERR_TUNNEL_CONNECTION_FAILED` and was recorded as blocked, not passed. The separate legacy repair passed 12 tests. These results do not claim that the newly registered full 15-suite runner has completed on GitHub.
