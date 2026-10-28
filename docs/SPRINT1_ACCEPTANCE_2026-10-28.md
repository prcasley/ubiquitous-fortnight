# Sprint 1: executive chat acceptance — October 28, 2026

This work continues from requested base `797cd4c`, retaining `8f28d26` satellite/mobile fixes. Public sources only; no internal files or comparable-sale datasets were added or used. Owner answers query published records on explicit request and keep existing redaction, identity and title/control caveats. Provider/model branding remains absent from executive screens.

## Implemented behavior

- Recognized towns start a search even without a command verb. Omitted types use industrial with the explicit “Showing industrial — say 'all types' to widen.” message. New locations reset unspecified acreage/radius/year criteria; explicit follow-up refinements preserve the current scope. Answering a pending location question retains the criteria already requested.
- “Within N miles of X” sets the radius and place separately. Geometry still uses the existing parcel-intersects-radius policy; the explanation follows the cards.
- Published construction years support before/after, older/newer-than filters. Missing years are excluded from accepted matches and displayed as a separate “year not published” group. They remain available for individual research without joining rankings or exports of accepted matches.
- Unsupported requests produce an “I couldn't apply: …” line, including sale availability, Turnpike proximity, unquantified “big,” IOS suitability, full-region coverage, infrastructure, zoning, deadlines, lease/price and tax-qualification conditions when requested. Northern New Jersey and Lehigh Valley requests explicitly use a named radius center, not a whole-region coverage claim.
- Help offers four tappable questions. One-edit spelling matches against property types and the supported town vocabulary require confirmation. Unknown places return no mock geocoder candidates. No typo, ambiguous market comparison or failed geocode starts a guessed search.
- Largest/biggest/the-big-one opens the largest accepted card; sorting remains limited to accepted retrieved records. Go back restores the previous criteria and retrieves fresh records. Plain-language clarification explains the current evidence limitations. Address queries geocode then identify a unique source parcel, rather than treating an address match as parcel verification.
- Board summaries use five evidence lines: count/range, largest site, separately checked OZ1/OZ2 reference shares, source/date, caveat. Unchecked references stay “not checked.” Reference intersections never become final designation or tax qualification.
- Chat export uses an explicit public-fact CSV allowlist. It excludes dossiers, notes, comps, contacts, cached owner names and missing-year records that failed a year filter.
- Voice has one-time inline consent, storage exception handling and a two-second final-transcript preview. Tap-to-edit or typing cancels automatic submission. This does not bypass browser/OS microphone permission.
- Base text is 17px with 15px minimum and A−/A+ preference controls. The compact placeholder is tested at 390px and 1280px. Top caveats have one short line and a “How to read this” link; the full notice and card caveats follow results. Satellite default and key-free dark street styling are retained.

## Regression coverage

Final local run: 134 unit/API tests, the existing browser smoke suite, 56 executive workflow checks, 83 prior CEO/mobile checks, and 173 new Sprint 1 persona/voice/readability checks.

`tests/sprint1-intent.test.mjs` contains all supplied persona and follow-up phrases, plus newer-than years, unknown locations, multiword town corrections, generic price phrasing and residential manufactured-home classification. `tests/sprint1-browser.py` opens a fresh isolated context for every persona phrase, checks actual criteria/place and replies, and tests follow-ups with and without a loaded search. It also checks board evidence, private-data-free export, missing years, readable sizing, voice consent persistence, edit cancellation, automatic submission, failure recovery and blocked localStorage.

The stricter fixture uncovered a previously hidden parser bug: an article in “find me a NJ property…” was being treated as a location. That is fixed. A live Palm Beach check also exposed manufactured homes matching `MANUF`; the server predicate and client classifier now explicitly exclude those residential uses from industrial matching.

GitHub Pages publication now runs all four browser suites as well as unit/API tests before uploading the site. The separate static QA workflow includes the new suite too.

## Live public-data checks

Local Chromium used a read-only HTTP relay to the actual public services; this checks query/data behavior, not native-device CORS or a published Pages build. No API keys, individual names or property-record exports are printed.

- Edison industrial over 10 acres, built before 1990: **38 accepted**, complete retrieval, **108 additional records with year not published** listed separately. Every accepted record had a published year satisfying the filter. Largest accepted reported acreage: 77.04 acres.
- “What's for sale in West Palm Beach”: industrial defaults explicitly; availability cannot be applied. The broad no-acreage query reaches the existing county retrieval cap, shows partial candidates and requests narrowing. No live listing coverage or whole-market ranking is claimed.

Counts are observations of changing public services, not fixed assertions in fixture tests.

## Acceptance still requiring external verification

**Sprint 1 is not signed off as CEO-ready until both gates below pass.**

1. After publication, open the Pages URL with a hard refresh and run the supplied persona/follow-up list against the deployed build. This environment's outbound proxy returns CONNECT HTTP 403 for `prcasley.github.io`, so deployment completion and native browser requests cannot be certified here. Remote `main` verification alone is not a deployment acceptance test. PA adapter behavior remains subject to its live county service/schema checks; fixture success is not proof of available PA coverage.
2. On a real iPhone in Safari, tap Speak, accept the inline consent and OS microphone permission, and say “industrial over 5 acres in Edison NJ.” Confirm the final text is previewed for about two seconds and results then load without another tap. Repeat Speak to verify consent is remembered. On another utterance, tap the preview to edit and verify no automatic search runs. Also verify microphone denial leaves typed search usable.

No simulated speech test or desktop/mobile viewport emulation substitutes for that iPhone check.
